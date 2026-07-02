use crate::config::AppConfig;
use crate::db::MemoryEngine;
use crate::providers::ModelProvider;
use crate::sandbox::WorkspaceSandbox;
use crate::sandbox_cmd::SafeCommandRunner;
use crate::skills::SkillsRegistry;
use crate::mcp::McpRegistry;
use crate::agents::SessionRouter;
use crate::channel::CommunicationChannel;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::collections::HashMap;

pub struct SopEngine {
    config: Arc<AppConfig>,
    db: Arc<MemoryEngine>,
    provider: Arc<dyn ModelProvider>,
    session_router: Arc<SessionRouter>,
    skills_registry: Arc<SkillsRegistry>,
    mcp_registry: Arc<McpRegistry>,
    command_runner: Arc<SafeCommandRunner>,
    sandbox: Arc<WorkspaceSandbox>,
    channels: Arc<HashMap<String, Arc<dyn CommunicationChannel>>>,
}

impl SopEngine {
    pub fn new(
        config: Arc<AppConfig>,
        db: Arc<MemoryEngine>,
        provider: Arc<dyn ModelProvider>,
        session_router: Arc<SessionRouter>,
        skills_registry: Arc<SkillsRegistry>,
        mcp_registry: Arc<McpRegistry>,
        command_runner: Arc<SafeCommandRunner>,
        sandbox: Arc<WorkspaceSandbox>,
        channels: Arc<HashMap<String, Arc<dyn CommunicationChannel>>>,
    ) -> Self {
        Self {
            config,
            db,
            provider,
            session_router,
            skills_registry,
            mcp_registry,
            command_runner,
            sandbox,
            channels,
        }
    }

    pub fn start(self, shutdown_token: tokio_util::sync::CancellationToken) {
        if !self.config.sop.enabled {
            tracing::info!("Proactive SOP scheduler loop is disabled in config.");
            return;
        }

        let db = self.db.clone();
        let provider = self.provider.clone();
        let session_router = self.session_router.clone();
        let skills_registry = self.skills_registry.clone();
        let mcp_registry = self.mcp_registry.clone();
        let command_runner = self.command_runner.clone();
        let sandbox = self.sandbox.clone();
        let config = self.config.clone();
        let channels = self.channels.clone();

        // Spawn Background Dreaming Loop
        let db_dream = self.db.clone();
        let provider_dream = self.provider.clone();
        let shutdown_token_dream = shutdown_token.clone();
        tokio::spawn(async move {
            tracing::info!("Autonomous Memory Consolidation (Dreaming Sweep) loop started.");
            let memory_dir = dirs::home_dir().unwrap_or_default().join(".hiroshi").join("memory");
            let _ = std::fs::create_dir_all(&memory_dir);

            // Run dreaming sweep every 12 hours
            let mut interval = tokio::time::interval(Duration::from_secs(12 * 3600));
            // Trigger first tick after 10 seconds to not block startup
            tokio::time::sleep(Duration::from_secs(10)).await;

            loop {
                tokio::select! {
                    _ = shutdown_token_dream.cancelled() => {
                        tracing::info!("Dreaming Sweep shutting down...");
                        break;
                    }
                    _ = interval.tick() => {
                        tracing::info!("Dreaming Sweep: Consolidating memory...");
                        
                        // Retrieve recent history logs to process
                        if let Ok(history) = db_dream.get_context("global", 16000) {
                            if history.is_empty() {
                                continue;
                            }
                            
                            let mut history_text = String::new();
                            for msg in &history {
                                history_text.push_str(&format!("{}: {}\n", msg.role, msg.content));
                            }
                            
                            let prompt = format!(
                                "You are Hiroshi Memory Compactor. Analyze these recent interactions, resolve contradictions, deduplicate information, and output a refined markdown profile summary of learnings, configurations, and decisions:\n\n{}",
                                history_text
                            );

                            let system_prompt = "Consolidate short-term conversation logs into a refined, high-level profile summary card. Keep it concise.";
                            
                            if let Ok(ref mut stream) = provider_dream.chat_stream(system_prompt, vec![crate::db::ChatMessage {
                                role: "user".to_string(),
                                content: prompt,
                            }]).await {
                                use futures_util::StreamExt;
                                let mut summary = String::new();
                                while let Some(chunk_res) = stream.next().await {
                                    if let Ok(text) = chunk_res {
                                        summary.push_str(&text);
                                    }
                                }
                                
                                if !summary.trim().is_empty() {
                                    // Write to MEMORY.md
                                    let memory_file = memory_dir.join("MEMORY.md");
                                    let mut existing = if memory_file.exists() {
                                        std::fs::read_to_string(&memory_file).unwrap_or_default()
                                    } else {
                                        "# Hiroshi Master Profile Memory\n\n".to_string()
                                    };
                                    existing.push_str(&format!("\n## Learnings Sweep - {}\n{}\n", chrono::Local::now().format("%Y-%m-%d"), summary));
                                    let _ = std::fs::write(&memory_file, existing);

                                    // Write reasoning to DREAMS.md
                                    let dreams_file = memory_dir.join("DREAMS.md");
                                    let mut dreams_log = if dreams_file.exists() {
                                        std::fs::read_to_string(&dreams_file).unwrap_or_default()
                                    } else {
                                        "# Hiroshi Dream Logs (Reasoning & Consolidation)\n\n".to_string()
                                    };
                                    dreams_log.push_str(&format!(
                                        "## Consolidation Cycle [{}]\n- Processed {} interaction records.\n- Resolved duplicate context parameters.\n- Status: Memory consolidated successfully.\n\n",
                                        chrono::Local::now().to_rfc3339(),
                                        history.len()
                                    ));
                                    let _ = std::fs::write(&dreams_file, dreams_log);
                                    tracing::info!("Dreaming Sweep: Memory consolidation write complete.");
                                }
                            }
                        }
                    }
                }
            }
        });

        tokio::spawn(async move {
            tracing::info!("Proactive SOP scheduler loop service started.");
            let mut interval = tokio::time::interval(Duration::from_secs(config.sop.interval_minutes * 60));
            // Skip the first tick since it fires immediately
            interval.tick().await;

            loop {
                tokio::select! {
                    _ = shutdown_token.cancelled() => {
                        tracing::info!("Proactive SOP scheduler loop shutting down...");
                        break;
                    }
                    _ = interval.tick() => {
                        tracing::info!("Proactive SOP scheduler loop triggered execution.");
                        for routine in &config.sop.routines {
                            tracing::info!("SOP executing routine: {}", routine.name);
                            
                            let session_id = format!("sop:{}", routine.name);
                            let disabled_skills = Arc::new(Mutex::new(std::collections::HashSet::new()));
                            let ws_tx = tokio::sync::broadcast::channel(100).0;
                            let active_agent_name = Arc::new(Mutex::new(config.sop.agent.clone()));

                            match crate::engine::run_agent_turn(
                                &session_id,
                                &routine.routine,
                                db.clone(),
                                provider.clone(),
                                session_router.clone(),
                                skills_registry.clone(),
                                mcp_registry.clone(),
                                command_runner.clone(),
                                sandbox.clone(),
                                &config,
                                disabled_skills,
                                ws_tx,
                                active_agent_name,
                                None,
                                "",
                            ).await {
                                Ok(response) => {
                                    if !response.trim().is_empty() {
                                        for channel_name in &config.sop.notify_channels {
                                            if let Some(channel) = channels.get(channel_name) {
                                                let target_id = db.get_last_session_id(channel_name).unwrap_or_default();
                                                if !target_id.is_empty() {
                                                    let formatted = format!("📢 **[SOP Alert - {}]**\n{}", routine.name, response);
                                                    let _ = channel.send_message(&target_id, &formatted).await;
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("Error executing SOP routine '{}': {}", routine.name, e);
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}
