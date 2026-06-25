mod config;
mod db;
mod provider;
mod sandbox;
mod agents;
mod cron;
mod telegram;

use config::init_hiroshi_dir;
use db::MemoryEngine;
use provider::OllamaProvider;
use sandbox::WorkspaceSandbox;
use agents::AgentRouter;
use cron::CronScheduler;
use telegram::TelegramGateway;

use futures_util::StreamExt;
use std::io::{self, Write};
use std::sync::Arc;
use std::time::Instant;

enum ToolCall {
    ReadFile { path: String },
    WriteFile { path: String, content: String },
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

    calls
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Initializing Hiroshi Daemon (Phase 2)...");
    
    let (config, db_path, workspace_path, agents_path, memory_dir) = match init_hiroshi_dir() {
        Ok(paths) => paths,
        Err(e) => {
            eprintln!("Initialization failure: {}", e);
            std::process::exit(1);
        }
    };

    println!("--------------------------------------------------");
    println!("System Name:  {}", config.engine.system_name);
    println!("Log Level:    {}", config.engine.log_level);
    println!("Ollama Host:  {}", config.ollama.host);
    println!("Model Name:   {}", config.ollama.model);
    println!("Workspace:    {}", workspace_path.to_string_lossy());
    println!("Database:     {}", db_path.to_string_lossy());
    println!("Agents File:  {}", agents_path.to_string_lossy());
    println!("--------------------------------------------------");
    println!("Type /help to see available commands or type /exit to quit.\n");

    let db = Arc::new(MemoryEngine::new(&db_path)?);
    let sandbox = Arc::new(WorkspaceSandbox::new(workspace_path));
    let provider = Arc::new(OllamaProvider::new(&config));

    // Initialize Agent Router
    let mut router = AgentRouter::load_from_file(&agents_path)?;

    // Spawn Background Scheduler
    let scheduler = CronScheduler::new(
        config.cron.tasks.clone(),
        db.clone(),
        provider.clone(),
        sandbox.clone(),
        memory_dir.clone(),
    );
    scheduler.start();

    // Spawn Telegram Long-polling gateway
    let tg_gateway = TelegramGateway::new(
        config.telegram.clone(),
        db.clone(),
        provider.clone(),
        agents_path.clone(),
    );
    tg_gateway.start();

    // Approximate character-to-token ratio (1 token = 4 chars)
    let context_chars_limit = config.ollama.context_window * 4;

    loop {
        let active_name = &router.active_agent;
        print!("Hiroshi [{}] > ", active_name);
        io::stdout().flush()?;

        let mut input = String::new();
        if io::stdin().read_line(&mut input)? == 0 {
            break; // EOF
        }

        let input = input.trim();
        if input.is_empty() {
            continue;
        }

        // Process slash commands
        if input.starts_with('/') {
            let parts: Vec<&str> = input.splitn(3, ' ').collect();
            match parts[0] {
                "/exit" | "/quit" => {
                    println!("Goodbye!");
                    break;
                }
                "/clear" => {
                    db.clear_history()?;
                    println!("Conversation history cleared.");
                }
                "/help" => {
                    println!("Available commands:");
                    println!("  /read <path>            - Read file inside workspace");
                    println!("  /write <path> <content> - Write file inside workspace");
                    println!("  /agent <name>           - Switch active agent");
                    println!("  /agents                 - List all registered agents");
                    println!("  /clear                  - Clear conversation history");
                    println!("  /exit                   - Quit Hiroshi");
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
        db.add_message("user", input)?;

        // Query RAG match context
        let rag_matches = db.search_rag_history(input, 3)?;
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

            let system_prompt = format!(
                "{}\nHand-off Rule: {}\n\nAllowed Tools: {:?}\n\nAll paths must be relative to the workspace. No absolute paths or '..' allowed.\nTo run a tool, you MUST output the request exactly using XML tags:\n- To read a file: <read_file>path/to/file</read_file>\n- To write/overwrite a file: <write_file path=\"path/to/file\">file content</write_file>\n\n{}",
                active_agent.prompt,
                active_agent.hand_off,
                active_agent.allowed_tools,
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
            db.add_message("assistant", &full_response)?;

            // Check if hand-off to another agent is triggered
            if let Some(next_agent) = router.detect_handoff(&full_response) {
                println!("\n[Handoff Route] Switching from {} to {}", router.active_agent, next_agent);
                router.switch_agent(&next_agent);
                // Continue the loop turn to let the next agent run
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
                }
            }
        }
    }

    Ok(())
}
