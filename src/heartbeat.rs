use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;
use crate::db::MemoryEngine;
use crate::providers::ModelProvider;
use crate::config::AppConfig;
use crate::db::ChatMessage;
use futures_util::StreamExt;

pub fn start_heartbeat_loop(
    db: Arc<MemoryEngine>,
    provider: Arc<dyn ModelProvider>,
    config: &AppConfig,
    workspace_path: PathBuf,
) {
    let provider_clone = provider.clone();
    let db_clone = db.clone();
    let _config_clone = config.clone();

    tokio::spawn(async move {
        // Heartbeat runs every 5 minutes
        let mut ticker = interval(Duration::from_secs(300));
        tracing::info!("Proactive Heartbeat loop initialized.");

        loop {
            ticker.tick().await;
            let heartbeat_file = workspace_path.join("HEARTBEAT.md");

            // Ensure HEARTBEAT.md exists
            if !heartbeat_file.exists() {
                let default_content = "# Proactive Heartbeat Tasks\n- [ ] Monitor workspace health\n- [ ] Analyze recent logs\n";
                let _ = fs::write(&heartbeat_file, default_content);
            }

            match fs::read_to_string(&heartbeat_file) {
                Ok(content) => {
                    let prompt = format!(
                        "HEARTBEAT Evaluation Turn:\n\
                         Please review the following active task checklist from HEARTBEAT.md:\n\n\
                         {}\n\n\
                         If all tasks are in order, completed, or no background actions/notifications are required at this time, respond with exactly: HEARTBEAT_OK\n\
                         Otherwise, perform the required actions or output the warning notification message.",
                        content
                    );

                    let chat_msg = ChatMessage {
                        role: "user".to_string(),
                        content: prompt,
                        images: None,
                    };

                    match provider_clone.chat_stream(
                        "You are an autonomous proactive supervisor. If no actions are needed, return HEARTBEAT_OK.",
                        vec![chat_msg],
                        None,
                    ).await {
                        Ok(mut stream) => {
                            let mut response_text = String::new();
                            while let Some(chunk) = stream.next().await {
                                if let Ok(text) = chunk {
                                    response_text.push_str(&text);
                                }
                            }

                            let trimmed = response_text.trim();
                            if trimmed.contains("HEARTBEAT_OK") {
                                tracing::info!("Heartbeat evaluated successfully: HEARTBEAT_OK (Suppressed notifications).");
                            } else {
                                tracing::info!("Heartbeat action required. Response: {}", trimmed);
                                // Dispatch notification payload to active logs
                                let _ = db_clone.add_message_with_vector(
                                    "system_heartbeat",
                                    "assistant",
                                    &response_text,
                                    provider_clone.as_ref()
                                ).await;
                            }
                        }
                        Err(e) => {
                            tracing::error!("Heartbeat model query failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to read HEARTBEAT.md: {}", e);
                }
            }
        }
    });
}
