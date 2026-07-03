use std::sync::Arc;
use crate::config::AppConfig;
use crate::db::MemoryEngine;
use crate::providers::ModelProvider;

pub async fn run_context_compaction(
    session_id: &str,
    db: &Arc<MemoryEngine>,
    provider: &Arc<dyn ModelProvider>,
    config: &AppConfig,
) -> Result<(), String> {
    // 1. Get current history characters count
    let context_chars_limit = config.ollama.context_window * 4;
    let history = db.get_context(session_id, context_chars_limit)?;
    
    let mut total_chars = 0;
    for msg in &history {
        total_chars += msg.content.len();
    }

    // Define bootstrapMaxChars threshold (e.g. 70% of context window characters limit)
    let bootstrap_max_chars = (context_chars_limit as f64 * 0.70) as usize;

    if total_chars < bootstrap_max_chars {
        return Ok(()); // No compaction needed yet
    }

    tracing::info!("[{}] Context size ({} chars) exceeded threshold ({}). Starting silent compaction...", session_id, total_chars, bootstrap_max_chars);

    // 2. Automated Silent memory flush using NO_REPLY
    let system_prompt = "You are Hiroshi Memory Compactor. Condense the core learnings and configurations of the conversation. Output NO_REPLY if there is nothing new to add.";
    let prompt = "Extract all critical configurations, code styles, decisions, and preferences from our conversation. Format as a brief, high-level summary.";

    if let Ok(mut stream) = provider.chat_stream(system_prompt, vec![crate::db::ChatMessage {
        role: "user".to_string(),
        content: prompt.to_string(),
        images: None,
    }], None).await {
        use futures_util::StreamExt;
        let mut summary = String::new();
        while let Some(chunk_res) = stream.next().await {
            if let Ok(text) = chunk_res {
                summary.push_str(&text);
            }
        }

        if !summary.trim().is_empty() && !summary.contains("NO_REPLY") {
            // Write memory update to MEMORY.md
            let memory_dir = dirs::home_dir().unwrap_or_default().join(".hiroshi").join("memory");
            let _ = std::fs::create_dir_all(&memory_dir);
            let memory_file = memory_dir.join("MEMORY.md");
            
            let mut existing = if memory_file.exists() {
                std::fs::read_to_string(&memory_file).unwrap_or_default()
            } else {
                "# Hiroshi Master Profile Memory\n\n".to_string()
            };
            existing.push_str(&format!("\n## Compacted Checkpoint - {}\n{}\n", chrono::Local::now().format("%Y-%m-%d"), summary));
            let _ = std::fs::write(&memory_file, existing);
            tracing::info!("[{}] Silent memory flush completed successfully.", session_id);
        }
    }

    // 3. Atomic Log Rotation and context pruning
    let summary_checkpoint = if history.len() > 4 {
        format!("System Checkpoint: Previous conversational turn history has been compacted. Major learnings: {}", 
                history.iter().take(history.len() - 2).map(|m| &m.content[..std::cmp::min(m.content.len(), 50)]).collect::<Vec<_>>().join("; "))
    } else {
        "System Checkpoint: Context window rotated.".to_string()
    };

    // Prune sqlite history except last 2 messages
    let mut pruned_history = Vec::new();
    if history.len() >= 2 {
        pruned_history.push(history[history.len() - 2].clone());
        pruned_history.push(history[history.len() - 1].clone());
    }

    // Clear and restore
    db.clear_history()?;
    db.add_message(session_id, "system", &summary_checkpoint)?;
    for msg in pruned_history {
        db.add_message(session_id, &msg.role, &msg.content)?;
    }

    tracing::info!("[{}] Atomic log rotation complete. Shifted back to active task.", session_id);
    Ok(())
}
