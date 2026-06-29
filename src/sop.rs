use crate::config::AppConfig;
use crate::db::MemoryEngine;
use crate::provider::OllamaProvider;
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
    provider: Arc<OllamaProvider>,
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
        provider: Arc<OllamaProvider>,
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
