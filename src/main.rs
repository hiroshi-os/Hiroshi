mod config;
mod db;
mod provider;
mod sandbox;
mod agents;
mod cron;
mod telegram;
mod sandbox_cmd;
mod skills;

use config::init_hiroshi_dir;
use db::MemoryEngine;
use provider::OllamaProvider;
use sandbox::WorkspaceSandbox;
use agents::SessionRouter;
use cron::CronScheduler;
use telegram::TelegramGateway;
use sandbox_cmd::SafeCommandRunner;
use skills::SkillsRegistry;

use futures_util::StreamExt;
use std::io::{self, Write};
use std::sync::Arc;
use std::time::Instant;

enum ToolCall {
    ReadFile { path: String },
    WriteFile { path: String, content: String },
    CallTool { name: String, json_args: String },
}

fn parse_tool_calls(content: &str) -> Vec<ToolCall> {
    let mut calls = Vec::new();
    
    // Parse <read_file>path</read_file>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<read_file>") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</read_file>") {
            let path = content[abs_start + 11..abs_start + end].trim().to_string();
            calls.push(ToolCall::ReadFile { path });
            last_idx = abs_start + end + 12;
        } else {
            break;
        }
    }

    // Parse <write_file path="path">content</write_file>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<write_file") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</write_file>") {
            let header_end = content[abs_start..].find(">").unwrap_or(0);
            let header = &content[abs_start..abs_start + header_end];
            let path = if let Some(p_start) = header.find("path=\"") {
                let p_sub = &header[p_start + 6..];
                if let Some(p_end) = p_sub.find("\"") {
                    p_sub[..p_end].to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let file_content = content[abs_start + header_end + 1..abs_start + end].to_string();
            if !path.is_empty() {
                calls.push(ToolCall::WriteFile { path, content: file_content });
            }
            last_idx = abs_start + end + 13;
        } else {
            break;
        }
    }

    // Parse <call_tool name="name">json_arguments</call_tool>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<call_tool") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</call_tool>") {
            let header_end = content[abs_start..].find(">").unwrap_or(0);
            let header = &content[abs_start..abs_start + header_end];
            let name = if let Some(p_start) = header.find("name=\"") {
                let p_sub = &header[p_start + 6..];
                if let Some(p_end) = p_sub.find("\"") {
                    p_sub[..p_end].to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let args = content[abs_start + header_end + 1..abs_start + end].trim().to_string();
            if !name.is_empty() {
                calls.push(ToolCall::CallTool { name, json_args: args });
            }
            last_idx = abs_start + end + 12;
        } else {
            break;
        }
    }

    calls
}

use tracing_subscriber::{fmt, prelude::*};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (config, db_path, workspace_path, agents_path, memory_dir, skills_dir) = match init_hiroshi_dir() {
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

    // Spawn Telegram Long-polling gateway
    let tg_gateway = TelegramGateway::new(
        config.telegram.clone(),
        db.clone(),
        provider.clone(),
        session_router.clone(),
        skills_registry.clone(),
        command_runner.clone(),
        workspace_path.clone(),
    );
    tg_gateway.start(shutdown_token.clone());

    // Approximate character-to-token ratio (1 token = 4 chars)
    let context_chars_limit = config.ollama.context_window * 4;

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

        // Save User Message
        let start_embed = Instant::now();
        let _ = db.add_message_with_vector("user", input, &provider).await;

        // Query RAG match context
        let query_vector = provider.get_embeddings(input).await.unwrap_or_default();
        tracing::info!("Local embedding generation took {:?}", start_embed.elapsed());

        let start_db = Instant::now();
        let rag_matches = if !query_vector.is_empty() {
            db.search_vector_rag(&query_vector, 3)?
        } else {
            db.search_rag_history(input, 3)?
        };
        tracing::info!("Vector database retrieval took {:?}", start_db.elapsed());
        let mut rag_context = String::new();
        if !rag_matches.is_empty() {
            rag_context.push_str("\n--- Relevant historical memory context ---\n");
            for m in rag_matches {
                rag_context.push_str(&format!("{}: {}\n", m.role, m.content));
            }
            rag_context.push_str("------------------------------------------\n");
        }

        let mut loop_turn = 0;
        let max_loop_turns = 5;

        while loop_turn < max_loop_turns {
            loop_turn += 1;
            
            let active_agent = router.get_active_agent()
                .ok_or_else(|| "No active agent found".to_string())?;

            // Generate dynamic skills descriptors list
            let mut dynamic_skills_str = String::new();
            if !skills_registry.skills.is_empty() {
                dynamic_skills_str.push_str("\nYou can also execute the following dynamic skills by outputting XML tags format:\n");
                for skill in &skills_registry.skills {
                    dynamic_skills_str.push_str(&format!(
                        "- <call_tool name=\"{}\">{}</call_tool>: {}\n",
                        skill.name,
                        if skill.schema.is_empty() { "JSON_ARGS" } else { &skill.schema },
                        skill.description
                    ));
                }
            }

            let system_prompt = format!(
                "{}\nHand-off Rule: {}\n\nAllowed Tools: {:?}\n\nAll paths must be relative to the workspace. No absolute paths or '..' allowed.\nTo run a built-in file tool, you MUST output the request exactly using XML tags:\n- To read a file: <read_file>path/to/file</read_file>\n- To write/overwrite a file: <write_file path=\"path/to/file\">file content</write_file>\n{}\n\n{}",
                active_agent.prompt,
                active_agent.hand_off,
                active_agent.allowed_tools,
                dynamic_skills_str,
                rag_context
            );

            // Get context (sliding window)
            let history = db.get_context(context_chars_limit)?;
            
            print!("\nAssistant [{}]: ", router.active_agent);
            io::stdout().flush()?;

            let start_time = Instant::now();
            let mut first_token = true;
            let mut full_response = String::new();

            match provider.chat_stream(&system_prompt, history).await {
                Ok(mut stream) => {
                    while let Some(chunk_res) = stream.next().await {
                        match chunk_res {
                            Ok(text) => {
                                if first_token {
                                    let elapsed = start_time.elapsed();
                                    eprintln!("\n[TTFT: {:.2?}]", elapsed);
                                    first_token = false;
                                }
                                print!("{}", text);
                                io::stdout().flush()?;
                                full_response.push_str(&text);
                            }
                            Err(e) => {
                                eprintln!("\nStream Error: {}", e);
                                break;
                            }
                        }
                    }
                    println!();
                }
                Err(e) => {
                    eprintln!("\nFailed to get stream from provider: {}", e);
                    break;
                }
            }

            if full_response.is_empty() {
                break;
            }

            // Save Assistant Message
            let _ = db.add_message_with_vector("assistant", &full_response, &provider).await;

            // Check if hand-off to another agent is triggered
            if let Some(next_agent) = router.detect_handoff(&full_response) {
                println!("\n[Handoff Route] Switching from {} to {}", router.active_agent, next_agent);
                router.switch_agent(&next_agent);
                let _ = session_router.update(session_id, router.clone());
                continue;
            }

            // Parse and execute tools if any
            let tool_calls = parse_tool_calls(&full_response);
            if tool_calls.is_empty() {
                break;
            }

            for tool in tool_calls {
                match tool {
                    ToolCall::ReadFile { path } => {
                        println!("\n>> Running Tool: read_file({})", path);
                        if !active_agent.allowed_tools.contains(&"ReadFile".to_string()) {
                            let err_msg = "Permission Denied: Active agent does not have permission to use ReadFile.";
                            println!(">> {}", err_msg);
                            db.add_message("user", err_msg)?;
                            continue;
                        }
                        match sandbox.read_file(&path) {
                            Ok(content) => {
                                let result_msg = format!("File content of '{}':\n{}", path, content);
                                db.add_message("user", &result_msg)?;
                                println!(">> Tool output successfully saved.");
                            }
                            Err(e) => {
                                let err_msg = format!("Failed to read file '{}': {}", path, e);
                                db.add_message("user", &err_msg)?;
                                println!(">> Tool failed: {}", e);
                            }
                        }
                    }
                    ToolCall::WriteFile { path, content } => {
                        println!("\n>> Running Tool: write_file({})", path);
                        if !active_agent.allowed_tools.contains(&"WriteFile".to_string()) {
                            let err_msg = "Permission Denied: Active agent does not have permission to use WriteFile.";
                            println!(">> {}", err_msg);
                            db.add_message("user", err_msg)?;
                            continue;
                        }
                        match sandbox.write_file(&path, &content) {
                            Ok(_) => {
                                let result_msg = format!("Successfully wrote file '{}'", path);
                                db.add_message("user", &result_msg)?;
                                println!(">> File written successfully.");
                            }
                            Err(e) => {
                                let err_msg = format!("Failed to write file '{}': {}", path, e);
                                db.add_message("user", &err_msg)?;
                                println!(">> Tool failed: {}", e);
                            }
                        }
                    }
                    ToolCall::CallTool { name, json_args } => {
                        println!("\n>> Running Tool: call_tool({}, {})", name, json_args);
                        if !active_agent.allowed_tools.contains(&name) {
                            let err_msg = format!("Permission Denied: Active agent does not have permission to use dynamic skill/binary '{}'.", name);
                            println!(">> {}", err_msg);
                            db.add_message("user", &err_msg)?;
                            continue;
                        }

                        if let Some(skill) = skills_registry.get_skill(&name) {
                            let start_tool = Instant::now();
                            match skill.run_ipc(&json_args, &workspace_path).await {
                                Ok(stdout) => {
                                    tracing::info!("Subprocess tool execution '{}' took {:?}", name, start_tool.elapsed());
                                    let result_msg = format!("Skill '{}' execution output:\n{}", name, stdout);
                                    let _ = db.add_message_with_vector("user", &result_msg, &provider).await;
                                    println!(">> Skill executed successfully.");
                                }
                                Err(e) => {
                                    tracing::error!("Subprocess tool execution '{}' failed after {:?}", name, start_tool.elapsed());
                                    let err_msg = format!("Skill '{}' execution failed: {}", name, e);
                                    db.add_message("user", &err_msg)?;
                                    println!(">> Skill failed: {}", e);
                                }
                            }
                        } else if config.security.allowed_binaries.contains(&name) {
                            let cmd_line = format!("{} {}", name, json_args.trim_matches('"'));
                            let start_cmd = Instant::now();
                            match command_runner.run_command(&cmd_line).await {
                                Ok(stdout) => {
                                    tracing::info!("Subprocess tool execution '{}' took {:?}", name, start_cmd.elapsed());
                                    let result_msg = format!("Command '{}' execution output:\n{}", name, stdout);
                                    let _ = db.add_message_with_vector("user", &result_msg, &provider).await;
                                    println!(">> Command executed successfully.");
                                }
                                Err(e) => {
                                    tracing::error!("Subprocess tool execution '{}' failed after {:?}", name, start_cmd.elapsed());
                                    let err_msg = format!("Command '{}' execution failed: {}", name, e);
                                    db.add_message("user", &err_msg)?;
                                    println!(">> Command failed: {}", e);
                                }
                            }
                        } else {
                            let err_msg = format!("Execution Error: Tool/Skill '{}' is neither registered as a dynamic skill nor whitelisted as an allowed system binary.", name);
                            db.add_message("user", &err_msg)?;
                            println!(">> {}", err_msg);
                        }
                    }
                }
            }
        }
        let _ = session_router.update(session_id, router.clone());
    }

    // Graceful Shutdown Cascade
    tracing::info!("Halted new terminal messages.");
    tracing::info!("Flushing database buffers...");
    drop(db);
    tracing::info!("Shutdown cascade complete. Exiting.");
    Ok(())
}
