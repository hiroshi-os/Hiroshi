mod config;
mod db;
mod provider;
mod sandbox;
mod agents;
mod cron;
mod telegram;
mod discord;
mod slack;
mod sandbox_cmd;
mod skills;
mod onboard;
mod mcp;
mod web;
mod channel;
mod engine;

use config::init_hiroshi_dir;
use channel::CommunicationChannel;
use db::MemoryEngine;
use provider::OllamaProvider;
use sandbox::WorkspaceSandbox;
use agents::SessionRouter;
use cron::CronScheduler;
use sandbox_cmd::SafeCommandRunner;
use skills::SkillsRegistry;

use std::io::{self, Write};
use std::sync::Arc;



use tracing_subscriber::{fmt, prelude::*};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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
    tracing::info!("Type /help to see available commands or type /exit to quit.\n");

    let db = Arc::new(MemoryEngine::new(&db_path)?);
    let sandbox = Arc::new(WorkspaceSandbox::new(workspace_path.clone()));
    let provider = Arc::new(OllamaProvider::new(&config));
    
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
    tracing::info!("Discovered {} dynamic skill(s) in registry.", skills_registry.skills.len());

    // Safe Command Runner
    let command_runner = Arc::new(SafeCommandRunner::new(
        config.security.allowed_binaries.clone(),
        workspace_path.clone(),
    ));

    // Initialize Session Router
    let session_router = Arc::new(SessionRouter::new(agents_path.clone()));
    let shutdown_token = tokio_util::sync::CancellationToken::new();

    // Spawn Background Scheduler
    let scheduler = CronScheduler::new(
        config.cron.tasks.clone(),
        db.clone(),
        provider.clone(),
        sandbox.clone(),
        memory_dir.clone(),
    );
    scheduler.start(shutdown_token.clone());

    let (ws_tx, _) = tokio::sync::broadcast::channel::<String>(100);
    let active_agent_name = Arc::new(std::sync::Mutex::new("Architect".to_string()));
    let disabled_skills = Arc::new(std::sync::Mutex::new(std::collections::HashSet::<String>::new()));

    // Initialize gateways channel multiplexer
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<channel::IncomingEvent>(100);
    let mut channels: std::collections::HashMap<String, Arc<dyn channel::CommunicationChannel>> = std::collections::HashMap::new();

    if config.telegram.enabled {
        let tg = Arc::new(telegram::TelegramGateway::new(config.telegram.clone()));
        let _ = tg.listen(event_tx.clone()).await;
        channels.insert("telegram".to_string(), tg);
    }
    if config.discord.enabled {
        let dc = Arc::new(discord::DiscordGateway::new(config.discord.clone()));
        let _ = dc.listen(event_tx.clone()).await;
        channels.insert("discord".to_string(), dc);
    }
    if config.slack.enabled {
        let sl = Arc::new(slack::SlackGateway::new(config.slack.clone()));
        let _ = sl.listen(event_tx.clone()).await;
        channels.insert("slack".to_string(), sl);
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

    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            let session_id = format!("{}:{}", event.channel_type, event.session_id);
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
            
            let channel = channels_clone.get(&event.channel_type).cloned();
            let channel_session_id = event.session_id.clone();
            let text = event.text.clone();

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

    // Spawn local Web UI dashboard server (Port 8080)
    let (web_input_tx, mut web_input_rx) = tokio::sync::mpsc::channel::<String>(100);
    let web_addr = "127.0.0.1:8080".parse().unwrap();
    web::start_web_server(
        web_addr,
        web_input_tx,
        ws_tx.clone(),
        active_agent_name.clone(),
        disabled_skills.clone(),
        skills_dir.clone(),
    );

    // Spawn a background thread to broadcast metrics periodically
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


    // Channel for Async Stdin Multiplexing
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

    let session_id = "terminal";

    loop {
        let mut router = session_router.get_or_create(session_id)?;
        {
            let mut guard = active_agent_name.lock().unwrap();
            *guard = router.active_agent.clone();
        }
        
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
            line = web_input_rx.recv() => {
                match line {
                    Some(l) => l,
                    None => break,
                }
            }
            _ = tokio::signal::ctrl_c() => {
                tracing::info!("Ctrl+C signal received. Starting graceful shutdown cascade...");
                shutdown_token.cancel();
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                break;
            }
        };

        let input = input_line.trim();
        if input.is_empty() {
            continue;
        }

        // Process slash commands
        if input.starts_with('/') {
            let parts: Vec<&str> = input.splitn(3, ' ').collect();
            match parts[0] {
                "/exit" | "/quit" => {
                    tracing::info!("Exit command received.");
                    break;
                }
                "/clear" => {
                    db.clear_history()?;
                    tracing::info!("Conversation history cleared.");
                }
                "/help" => {
                    println!("Available commands:");
                    println!("  /read <path>            - Read file inside workspace");
                    println!("  /write <path> <content> - Write file inside workspace");
                    println!("  /agent <name>           - Switch active agent");
                    println!("  /agents                 - List all registered agents");
                    println!("  /skills                 - List discovered polyglot skills");
                    println!("  /clear                  - Clear conversation history");
                    println!("  /exit                   - Quit Hiroshi");
                }
                "/skills" => {
                    println!("Discovered Skills:");
                    if skills_registry.skills.is_empty() {
                        println!("  No dynamic skills found.");
                    } else {
                        for skill in &skills_registry.skills {
                            println!("  - {}: description: '{}', path: '{}'", skill.name, skill.description, skill.executable_path.to_string_lossy());
                        }
                    }
                }
                "/agents" => {
                    println!("Registered Agents in AGENTS.md:");
                    for (name, agent) in &router.agents {
                        println!("  - {}: prompt: '{}', tools: {:?}", name, agent.prompt, agent.allowed_tools);
                    }
                }
                "/agent" => {
                    if parts.len() < 2 {
                        println!("Usage: /agent <agent_name>");
                    } else if router.switch_agent(parts[1]) {
                        println!("Switched active agent to: {}", parts[1]);
                        let _ = session_router.update(session_id, router.clone());
                    } else {
                        println!("Agent '{}' not found in AGENTS.md", parts[1]);
                    }
                }
                "/read" => {
                    if parts.len() < 2 {
                        println!("Usage: /read <relative_path>");
                    } else {
                        match sandbox.read_file(parts[1]) {
                            Ok(content) => println!("--- File Content ({}) ---\n{}\n-------------------------", parts[1], content),
                            Err(e) => println!("Error: {}", e),
                        }
                    }
                }
                "/write" => {
                    if parts.len() < 3 {
                        println!("Usage: /write <relative_path> <content>");
                    } else {
                        match sandbox.write_file(parts[1], parts[2]) {
                            Ok(_) => println!("Successfully wrote to {}", parts[1]),
                            Err(e) => println!("Error: {}", e),
                        }
                    }
                }
                _ => {
                    println!("Unknown command: {}. Type /help for assistance.", parts[0]);
                }
            }
            continue;
        }

        // Run agent turn
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
            disabled_skills.clone(),
            ws_tx.clone(),
            active_agent_name.clone(),
            None,
            "",
        ).await {
            eprintln!("Error: {}", e);
        }
    }

    // Graceful Shutdown Cascade
    tracing::info!("Halted new terminal messages.");
    tracing::info!("Flushing database buffers...");
    drop(db);
    tracing::info!("Shutdown cascade complete. Exiting.");
    Ok(())
}
