mod config;
mod db;
mod provider;
mod sandbox;
mod agents;
mod cron;
#[cfg(feature = "channel-telegram")]
mod telegram;
#[cfg(feature = "channel-discord")]
mod discord;
#[cfg(feature = "channel-slack")]
mod slack;
mod sandbox_cmd;
mod skills;
mod onboard;
mod mcp;
#[cfg(feature = "gateway-ui")]
mod web;
mod channel;
mod engine;
mod sop;
mod gateway;
mod memory;
mod service;
mod doctor;
mod migration;
mod providers;
mod hygiene;
mod compactor;
mod hub_client;
mod tools;
mod heartbeat;
mod protocols;

use clap::{Parser, Subcommand};

use config::init_hiroshi_dir;
#[allow(unused_imports)]
use channel::CommunicationChannel;
use db::MemoryEngine;
use sandbox::WorkspaceSandbox;
use crate::providers::ModelProvider;
use agents::SessionRouter;
use cron::CronScheduler;
use sandbox_cmd::SafeCommandRunner;
use skills::SkillsRegistry;

use std::io::{self, Write};
use std::sync::Arc;
use std::time::Duration;

use tracing_subscriber::{fmt, prelude::*};

#[derive(Parser)]
#[command(name = "hiroshi", about = "Hiroshi Agent Kernel")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start interactive agent terminal chat mode
    Agent,
    /// Launch interactive onboarding wizard setup assistant
    Onboard,
    /// Boot background services daemon (Gateways, Dashboard, SOP)
    Daemon,
    /// Cross-platform daemon service management installer
    Service {
        #[command(subcommand)]
        action: ServiceAction,
    },
    /// Run diagnostic environment health checks
    Doctor,
    /// Migrate settings and identity documents from other agent platforms
    Migrate {
        /// The platform source to migrate from (e.g. openclaw, zeroclaw)
        #[arg(short, long, default_value = "openclaw")]
        source: String,
    },
    /// Capability registry package manager commands (search, install, publish, list, remove, pin)
    Hub {
        #[command(subcommand)]
        action: HubAction,
    },
    /// Start Agent Client Protocol stdio host interface
    Acp,
}

#[derive(Subcommand, Clone, Debug)]
pub enum HubAction {
    /// Search for packages in the remote registry
    Search { query: String },
    /// Install a package from the remote registry (name[@version])
    Install { package: String },
    /// Publish a package directory to the remote registry
    Publish { path: String },
    /// List all currently installed registry packages
    List,
    /// Remove an installed package
    Remove { name: String },
    /// Pin an installed package version to lock it from auto-updates
    Pin { name: String },
}

#[derive(Subcommand, Clone, Debug)]
pub enum ServiceAction {
    /// Install the daemon service
    Install,
    /// Uninstall the daemon service
    Uninstall,
    /// Start the daemon service
    Start,
    /// Stop the daemon service
    Stop,
    /// Check daemon service status
    Status,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    let (config, db_path, workspace_path, agents_path, memory_dir, skills_dir) = match init_hiroshi_dir().await {
        Ok(paths) => paths,
        Err(e) => {
            eprintln!("Initialization failure: {}", e);
            std::process::exit(1);
        }
    };

    // Initialize structured logging
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let log_file_path = home.join(".hiroshi").join("hiroshi.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(&log_file_path)?;

    let file_layer = fmt::layer()
        .with_writer(log_file)
        .with_ansi(false);

    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout);

    let directive = match config.engine.log_level.to_lowercase().as_str() {
        "debug" => tracing::Level::DEBUG,
        "warn" => tracing::Level::WARN,
        "error" => tracing::Level::ERROR,
        _ => tracing::Level::INFO,
    };

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env().add_directive(directive.into()))
        .with(stdout_layer)
        .with(file_layer)
        .init();

    tracing::info!("--------------------------------------------------");
    tracing::info!("System Name:  {}", config.engine.system_name);
    tracing::info!("Log Level:    {}", config.engine.log_level);
    tracing::info!("Ollama Host:  {}", config.ollama.host);
    tracing::info!("Model Name:   {}", config.ollama.model);
    tracing::info!("Workspace:    {}", workspace_path.to_string_lossy());
    tracing::info!("Database:     {}", db_path.to_string_lossy());
    tracing::info!("Agents File:  {}", agents_path.to_string_lossy());
    tracing::info!("Skills Dir:   {}", skills_dir.to_string_lossy());
    tracing::info!("--------------------------------------------------");

    let db = Arc::new(MemoryEngine::new(&db_path)?);
    let sandbox = Arc::new(WorkspaceSandbox::new(workspace_path.clone()));
    let provider: Arc<dyn ModelProvider> = crate::providers::create_provider(
        &config.engine.provider.clone().unwrap_or("ollama".to_string()),
        &config
    );
    
    // Initialize MCP Registry & Clients
    let mcp_registry = Arc::new(mcp::McpRegistry::new(&config.mcp_servers));
    mcp_registry.initialize_all().await;

    // Reflect MCP tools into skills directory as dummy skills with SKILL.md schemas
    let mcp_tools = mcp_registry.get_all_tools().await;
    for tool in &mcp_tools {
        if let Some(obj) = tool.as_object() {
            let namespaced_name = obj.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
            let desc = obj.get("description").and_then(|d| d.as_str()).unwrap_or("");
            let input_schema = obj.get("inputSchema");
            let schema_str = input_schema
                .map(|schema| serde_json::to_string(schema).unwrap_or_else(|_| "{}".to_string()))
                .unwrap_or_else(|| "{}".to_string());
            
            let mcp_skill_name = format!("mcp__{}", namespaced_name);
            let skill_folder = skills_dir.join(&mcp_skill_name);
            if !skill_folder.exists() {
                if let Err(e) = std::fs::create_dir_all(&skill_folder) {
                    tracing::error!("Failed to create MCP skill folder {:?}: {}", skill_folder, e);
                    continue;
                }
            }
            let skill_md_path = skill_folder.join("SKILL.md");
            let md_content = format!(
                "---\nname: {}\ndescription: {:?}\nschema: {:?}\n---\n# MCP Tool Reflection\nAuto-generated skill placeholder for MCP tool `{}`.",
                mcp_skill_name, desc, schema_str, namespaced_name
            );
            if let Err(e) = std::fs::write(&skill_md_path, md_content) {
                tracing::error!("Failed to write SKILL.md for MCP skill: {}", e);
            }
        }
    }

    // Dynamic Skills Registry
    let skills_registry = Arc::new(SkillsRegistry::scan_dir(&skills_dir)?);
    tracing::info!("Discovered {} dynamic skill(s) in registry.", skills_registry.list_skills().len());

    // Safe Command Runner
    let command_runner = Arc::new(SafeCommandRunner::new(
        config.security.allowed_binaries.clone(),
        workspace_path.clone(),
    ));

    // Initialize Session Router
    let session_router = Arc::new(SessionRouter::new(agents_path.clone()));

    match cli.command {
        Commands::Onboard => {
            onboard::run_onboarding().await?;
        }
        Commands::Agent => {
            let hiroshi_dir = dirs::home_dir().ok_or("Could not determine home directory")?.join(".hiroshi");
            let lock_path = hiroshi_dir.join(".gateway.lock");
            let lock_file = std::fs::File::create(&lock_path)
                .map_err(|e| format!("Failed to create gateway lock file: {}", e))?;
            use fs2::FileExt;
            let mut _agent_lock = None;
            if lock_file.try_lock_exclusive().is_err() {
                println!("WARNING: Another Hiroshi daemon or agent instance is already running.");
                println!("Entering READ-ONLY mode. Database writes and file modifications will be disabled.\n");
                db.set_read_only(true);
            } else {
                _agent_lock = Some(lock_file);
            }

            println!("Interactive Agent Terminal Mode started.");
            println!("Type /help to see available commands or type /exit to quit.\n");

            let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(100);
            tokio::task::spawn_blocking(move || {
                use std::io::BufRead;
                let stdin = io::stdin();
                let mut reader = stdin.lock();
                loop {
                    let mut line = String::new();
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) => {
                            if stdin_tx.blocking_send(line).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            });

            loop {
                let mut router = session_router.get_or_create("terminal")?;
                let active_name = &router.active_agent;
                print!("Hiroshi [{}] > ", active_name);
                io::stdout().flush()?;

                let input_line = tokio::select! {
                    line = stdin_rx.recv() => {
                        match line {
                            Some(l) => l,
                            None => break,
                        }
                    }
                    _ = tokio::signal::ctrl_c() => {
                        tracing::info!("Ctrl+C signal received. Exiting Interactive mode...");
                        break;
                    }
                };

                let input = input_line.trim();
                if input.is_empty() {
                    continue;
                }

                if input.starts_with('/') {
                    let parts: Vec<&str> = input.splitn(3, ' ').collect();
                    match parts[0] {
                        "/exit" | "/quit" => break,
                        "/clear" => {
                            db.clear_history()?;
                            println!("Conversation history cleared.");
                        }
                        "/help" => {
                            println!("Available commands:");
                            println!("  /agent <name> - Switch active agent");
                            println!("  /agents       - List all registered agents");
                            println!("  /skills       - List dynamic skills");
                            println!("  /clear        - Clear history");
                            println!("  /exit         - Quit");
                        }
                        "/skills" => {
                            println!("Discovered Skills:");
                            for skill in skills_registry.list_skills() {
                                println!("  - {}: {}", skill.name, skill.description);
                            }
                        }
                        "/agents" => {
                            println!("Registered Agents:");
                            for (name, agent) in &router.agents {
                                println!("  - {}: prompt: '{}'", name, agent.prompt);
                            }
                        }
                        "/agent" => {
                            if parts.len() < 2 {
                                println!("Usage: /agent <agent_name>");
                            } else if router.switch_agent(parts[1]) {
                                println!("Switched active agent to: {}", parts[1]);
                                let _ = session_router.update("terminal", router.clone());
                            } else {
                                println!("Agent '{}' not found", parts[1]);
                            }
                        }
                        _ => println!("Unknown command: {}", parts[0]),
                    }
                    continue;
                }

                let disabled_skills = Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
                let (ws_tx, _) = tokio::sync::broadcast::channel::<String>(100);
                let active_agent_name = Arc::new(std::sync::Mutex::new("Architect".to_string()));

                if let Err(e) = crate::engine::run_agent_turn(
                    "terminal",
                    input,
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
                    eprintln!("Error: {}", e);
                }
            }
        }
        Commands::Daemon => {
            // Advisory gateway lock: prevent parallel daemon instances
            let hiroshi_dir = dirs::home_dir().ok_or("Could not determine home directory")?.join(".hiroshi");
            let lock_path = hiroshi_dir.join(".gateway.lock");
            let lock_file = std::fs::File::create(&lock_path)
                .map_err(|e| format!("Failed to create gateway lock file: {}", e))?;
            use fs2::FileExt;
            if lock_file.try_lock_exclusive().is_err() {
                eprintln!("ERROR: Another Hiroshi daemon instance is already running.");
                eprintln!("Lock file: {}", lock_path.display());
                std::process::exit(1);
            }
            // Hold the lock handle for the process lifetime
            let _gateway_lock = lock_file;
            tracing::info!("Advisory gateway lock acquired: {}", lock_path.display());

            println!("Background Daemon Mode started.");
            let shutdown_token = tokio_util::sync::CancellationToken::new();

            // Initialize Allowlist Engine
            let allowlist = gateway::allow_from::AllowlistEngine::new(
                config.security.allowed_senders.clone(),
            );
            let allowlist = Arc::new(allowlist);

            let (ws_tx, _) = tokio::sync::broadcast::channel::<String>(100);
            let active_agent_name = Arc::new(std::sync::Mutex::new("Architect".to_string()));
            let disabled_skills = Arc::new(std::sync::Mutex::new(std::collections::HashSet::<String>::new()));

            // Spawn Background Scheduler
            let scheduler = CronScheduler::new(
                config.cron.tasks.clone(),
                db.clone(),
                provider.clone(),
                sandbox.clone(),
                memory_dir.clone(),
                ws_tx.clone(),
            );
            scheduler.start(shutdown_token.clone());

            // Spawn Background Heartbeat Loop
            crate::heartbeat::start_heartbeat_loop(
                db.clone(),
                provider.clone(),
                &config,
                workspace_path.clone(),
            );

            // Initialize gateways channel multiplexer
            let (_event_tx, mut event_rx) = tokio::sync::mpsc::channel::<channel::ChannelMessage>(100);
            #[allow(unused_mut)]
            let mut channels: std::collections::HashMap<String, Arc<dyn channel::CommunicationChannel>> = std::collections::HashMap::new();

            #[cfg(feature = "channel-telegram")]
            {
                if config.telegram.enabled {
                    let tg = Arc::new(telegram::TelegramGateway::new(config.telegram.clone()));
                    let _ = tg.listen(_event_tx.clone()).await;
                    channels.insert("telegram".to_string(), tg);
                }
            }
            #[cfg(feature = "channel-discord")]
            {
                if config.discord.enabled {
                    let dc = Arc::new(discord::DiscordGateway::new(config.discord.clone()));
                    let _ = dc.listen(_event_tx.clone()).await;
                    channels.insert("discord".to_string(), dc);
                }
            }
            #[cfg(feature = "channel-slack")]
            {
                if config.slack.enabled {
                    let sl = Arc::new(slack::SlackGateway::new(config.slack.clone()));
                    let _ = sl.listen(_event_tx.clone()).await;
                    channels.insert("slack".to_string(), sl);
                }
            }
            let channels = Arc::new(channels);

            // Spawning Gateway Multiplexer router
            let db_clone = db.clone();
            let provider_clone = provider.clone();
            let session_router_clone = session_router.clone();
            let skills_registry_clone = skills_registry.clone();
            let mcp_registry_clone = mcp_registry.clone();
            let command_runner_clone = command_runner.clone();
            let sandbox_clone = sandbox.clone();
            let config_clone = Arc::new(config.clone());
            let disabled_skills_clone = disabled_skills.clone();
            let ws_tx_clone = ws_tx.clone();
            let active_agent_name_clone = active_agent_name.clone();
            let channels_clone = channels.clone();

            let allowlist_clone = allowlist.clone();

            tokio::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    // Enforce allowlist gating
                    if !allowlist_clone.is_allowed(&event) {
                        tracing::warn!("Allowlist blocked message from sender_id: {}", event.sender_id);
                        continue;
                    }

                    let session_id = event.session_key.clone();
                    let db = db_clone.clone();
                    let provider = provider_clone.clone();
                    let session_router = session_router_clone.clone();
                    let skills_registry = skills_registry_clone.clone();
                    let mcp_registry = mcp_registry_clone.clone();
                    let command_runner = command_runner_clone.clone();
                    let sandbox = sandbox_clone.clone();
                    let config = config_clone.clone();
                    let disabled_skills = disabled_skills_clone.clone();
                    let ws_tx = ws_tx_clone.clone();
                    let active_agent_name = active_agent_name_clone.clone();

                    let origin_str = event.origin.to_string();
                    let channel = channels_clone.get(&origin_str).cloned();
                    let channel_session_id = event.sender_id.clone();
                    let mut text = event.text.clone();

                    if text.starts_with("/acp_bind") || text.starts_with("/cas_resume") {
                        let response = if text.starts_with("/acp_bind") {
                            let arg = text["/acp_bind".len()..].trim();
                            crate::protocols::acp::handle_acp_bind(&session_id, arg)
                        } else {
                            crate::protocols::acp::handle_cas_resume(&session_id)
                        };
                        if let Some(chan) = channel {
                            let _ = chan.send_message(&channel_session_id, &response).await;
                        }
                        continue;
                    }

                    if let Some(ref media_list) = event.media {
                        let stt_engine = crate::gateway::voice::AudioTranscriptionEngine::new(
                            &std::env::var("OPENAI_API_KEY").unwrap_or_default()
                        );
                        for asset in media_list {
                            if asset.mime_type.starts_with("audio/") {
                                if let Ok(transcript) = stt_engine.transcribe_media(asset).await {
                                    text.push_str(&format!("\n\n*Voice Transcript:*\n{}", transcript));
                                }
                            }
                        }
                        let summary = crate::gateway::media::MediaAsset::degrade_assets(media_list);
                        text.push_str(&summary);
                    }

                    tokio::spawn(async move {
                        if let Err(e) = crate::engine::run_agent_turn(
                            &session_id,
                            &text,
                            db,
                            provider,
                            session_router,
                            skills_registry,
                            mcp_registry,
                            command_runner,
                            sandbox,
                            &config,
                            disabled_skills,
                            ws_tx,
                            active_agent_name,
                            channel,
                            &channel_session_id,
                        ).await {
                            tracing::error!("Error executing agent turn for session {}: {}", session_id, e);
                        }
                    });
                }
            });

            // Start SOP Engine
            let sop_engine = sop::SopEngine::new(
                Arc::new(config.clone()),
                db.clone(),
                provider.clone(),
                session_router.clone(),
                skills_registry.clone(),
                mcp_registry.clone(),
                command_runner.clone(),
                sandbox.clone(),
                channels.clone(),
            );
            sop_engine.start(shutdown_token.clone());

            // Spawn local Web UI dashboard server
            #[cfg(feature = "gateway-ui")]
            {
                let (web_input_tx, mut web_input_rx) = tokio::sync::mpsc::channel::<String>(100);
                let mut bind_ip = "127.0.0.1".to_string();
                if config.tailscale.enabled {
                    match gateway::tailscale::resolve_tailscale_ip() {
                        Ok(ip) => {
                            tracing::info!("Tailscale enabled. Resolved Tailnet IP: {}", ip);
                            bind_ip = ip;
                        }
                        Err(e) => {
                            tracing::warn!("Tailscale enabled but resolution failed: {}. Falling back.", e);
                            if let Some(ref fallback) = config.tailscale.interface_fallback {
                                bind_ip = fallback.clone();
                            }
                        }
                    }
                }
                let web_addr: std::net::SocketAddr = format!("{}:8080", bind_ip).parse()
                    .unwrap_or_else(|_| "127.0.0.1:8080".parse().unwrap());
                
                web::start_web_server(
                    web_addr,
                    web_input_tx,
                    ws_tx.clone(),
                    active_agent_name.clone(),
                    disabled_skills.clone(),
                    skills_dir.clone(),
                );

                // Spawn background metrics thread
                let ws_tx_metrics = ws_tx.clone();
                let active_agent_metrics = active_agent_name.clone();
                tokio::spawn(async move {
                    loop {
                        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                        let active = {
                            let guard = active_agent_metrics.lock().unwrap();
                            guard.clone()
                        };
                        let metrics_msg = serde_json::json!({
                            "type": "metrics",
                            "ram": 18, 
                            "cpu": 0.5,
                            "tps": "0.1",
                            "active_agent": active
                        });
                        if let Ok(msg_str) = serde_json::to_string(&metrics_msg) {
                            let _ = ws_tx_metrics.send(msg_str);
                        }
                    }
                });

                // Listen to web input channel
                let db_clone = db.clone();
                let provider_clone = provider.clone();
                let session_router_clone = session_router.clone();
                let skills_registry_clone = skills_registry.clone();
                let mcp_registry_clone = mcp_registry.clone();
                let command_runner_clone = command_runner.clone();
                let sandbox_clone = sandbox.clone();
                let config_clone = Arc::new(config.clone());
                let disabled_skills_clone = disabled_skills.clone();
                let ws_tx_clone = ws_tx.clone();
                let active_agent_name_clone = active_agent_name.clone();
                
                tokio::spawn(async move {
                    while let Some(msg) = web_input_rx.recv().await {
                        let _ = crate::engine::run_agent_turn(
                            "terminal",
                            &msg,
                            db_clone.clone(),
                            provider_clone.clone(),
                            session_router_clone.clone(),
                            skills_registry_clone.clone(),
                            mcp_registry_clone.clone(),
                            command_runner_clone.clone(),
                            sandbox_clone.clone(),
                            &config_clone,
                            disabled_skills_clone.clone(),
                            ws_tx_clone.clone(),
                            active_agent_name_clone.clone(),
                            None,
                            "",
                        ).await;
                    }
                });
            }

            tokio::signal::ctrl_c().await.unwrap();
            tracing::info!("Ctrl+C received. Gracefully stopping daemon...");
            shutdown_token.cancel();
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        Commands::Service { action } => {
            service::handle_service_cmd(action)?;
        }
        Commands::Doctor => {
            doctor::run_diagnostics(&config, &db_path, &workspace_path).await?;
        }
        Commands::Migrate { source } => {
            migration::migrate_configs(&source)?;
        }
        Commands::Hub { action } => {
            hub_client::handle_hub_cmd(action).await?;
        }
        Commands::Acp => {
            crate::protocols::acp::run_acp_stdio_loop(db.clone(), provider.clone()).await?;
        }
    }

    // Graceful Shutdown Cascade
    tracing::info!("Flushing database buffers...");
    drop(db);
    tracing::info!("Shutdown cascade complete. Exiting.");
    Ok(())
}
