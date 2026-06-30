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
use std::time::Instant;
use std::io::{self, Write};
use futures_util::StreamExt;

enum ToolCall {
    ReadFile { path: String },
    WriteFile { path: String, content: String },
    CallTool { name: String, json_args: String },
    CreateSkill { name: String, description: String, schema: String, code: String },
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

    // Parse <create_skill name="name">...</create_skill>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<create_skill") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</create_skill>") {
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

            let block = &content[abs_start + header_end + 1..abs_start + end];
            
            let description = if let Some(d_start) = block.find("<description>") {
                if let Some(d_end) = block[d_start..].find("</description>") {
                    block[d_start + 13..d_start + d_end].trim().to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let schema = if let Some(s_start) = block.find("<schema>") {
                if let Some(s_end) = block[s_start..].find("</schema>") {
                    block[s_start + 8..s_start + s_end].trim().to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let code = if let Some(c_start) = block.find("<code>") {
                if let Some(c_end) = block[c_start..].find("</code>") {
                    block[c_start + 6..c_start + c_end].to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            if !name.is_empty() {
                calls.push(ToolCall::CreateSkill { name, description, schema, code });
            }
            last_idx = abs_start + end + 15;
        } else {
            break;
        }
    }

    calls
}

pub async fn run_agent_turn(
    session_id: &str,
    input: &str,
    db: Arc<MemoryEngine>,
    provider: Arc<OllamaProvider>,
    session_router: Arc<SessionRouter>,
    skills_registry: Arc<SkillsRegistry>,
    mcp_registry: Arc<McpRegistry>,
    command_runner: Arc<SafeCommandRunner>,
    sandbox: Arc<WorkspaceSandbox>,
    config: &AppConfig,
    disabled_skills: Arc<Mutex<std::collections::HashSet<String>>>,
    ws_tx: tokio::sync::broadcast::Sender<String>,
    active_agent_name: Arc<Mutex<String>>,
    channel: Option<Arc<dyn CommunicationChannel>>,
    channel_session_id: &str,
) -> Result<String, String> {
    let mut router = session_router.get_or_create(session_id)?;
    {
        let mut guard = active_agent_name.lock().unwrap();
        *guard = router.active_agent.clone();
    }

    // Save User Message
    let start_embed = Instant::now();
    let _ = db.add_message_with_vector(session_id, "user", input, &provider).await;
    tracing::info!("[{}] Message embedding took {:?}", session_id, start_embed.elapsed());

    // Hybrid 70/30 RAG retrieval (Vector 70% + FTS5 30% via RRF)
    let start_db = Instant::now();
    let hybrid_results = crate::memory::search::hybrid_search(
        &db, &provider, session_id, input, 3
    ).await?;
    tracing::info!("[{}] Hybrid search retrieval took {:?}", session_id, start_db.elapsed());

    let rag_matches = crate::memory::search::scored_to_chat_messages(hybrid_results);
    let mut rag_context = String::new();
    if !rag_matches.is_empty() {
        rag_context.push_str("\n--- Relevant historical memory context (Hybrid 70/30 RRF) ---\n");
        for m in &rag_matches {
            rag_context.push_str(&format!("{}: {}\n", m.role, m.content));
        }
        rag_context.push_str("--------------------------------------------------------------\n");
    }

    let context_chars_limit = config.ollama.context_window * 4;
    let mut loop_turn = 0;
    let max_loop_turns = 5;
    let mut last_response = String::new();

    while loop_turn < max_loop_turns {
        loop_turn += 1;
        
        let active_agent = router.get_active_agent()
            .ok_or_else(|| "No active agent found".to_string())?;

        // Generate dynamic skills descriptors list
        let mut dynamic_skills_str = String::new();
        let skills_list = skills_registry.list_skills();
        if !skills_list.is_empty() {
            dynamic_skills_str.push_str("\nYou can also execute the following dynamic skills by outputting XML tags format:\n");
            for skill in &skills_list {
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
        let history = db.get_context(session_id, context_chars_limit)?;
        
        let active_name = &router.active_agent;
        print!("\nAssistant [{}] ({}) > ", active_name, session_id);
        io::stdout().flush().map_err(|e| e.to_string())?;

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
                                tracing::debug!("\n[{}] [TTFT: {:.2?}]", session_id, elapsed);
                                first_token = false;
                            }
                            print!("{}", text);
                            io::stdout().flush().map_err(|e| e.to_string())?;
                            full_response.push_str(&text);

                            // Broadcast token chunk to WebSocket clients
                            let ws_msg = serde_json::json!({
                                "type": "chat_chunk",
                                "role": "assistant",
                                "content": text
                            });
                            if let Ok(msg_str) = serde_json::to_string(&ws_msg) {
                                let _ = ws_tx.send(msg_str);
                            }
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

        last_response = full_response.clone();

        // Save Assistant Message
        let _ = db.add_message_with_vector(session_id, "assistant", &full_response, &provider).await;

        // Send intermediate response back to external channel if present
        if let Some(ref chan) = channel {
            let formatted_response = format!("🤖 *[{}]*:\n{}", router.active_agent, full_response);
            if let Err(e) = chan.send_message(channel_session_id, &formatted_response).await {
                tracing::error!("Failed to send message to channel {}: {}", session_id, e);
            }
        }

        // Check if hand-off to another agent is triggered
        if let Some(next_agent) = router.detect_handoff(&full_response) {
            println!("\n[Handoff Route] Switching from {} to {}", router.active_agent, next_agent);
            let ws_handoff = serde_json::json!({
                "type": "agent_shift",
                "from": router.active_agent.clone(),
                "to": next_agent.clone()
            });
            if let Ok(msg_str) = serde_json::to_string(&ws_handoff) {
                let _ = ws_tx.send(msg_str);
            }
            router.switch_agent(&next_agent);
            let _ = session_router.update(session_id, router.clone());
            {
                let mut guard = active_agent_name.lock().unwrap();
                *guard = router.active_agent.clone();
            }
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
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    match sandbox.read_file(&path) {
                        Ok(content) => {
                            let result_msg = format!("File content of '{}':\n{}", path, content);
                            db.add_message(session_id, "user", &result_msg)?;
                            println!(">> Tool output successfully saved.");
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to read file '{}': {}", path, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::WriteFile { path, content } => {
                    println!("\n>> Running Tool: write_file({})", path);
                    if db.is_read_only() {
                        let err_msg = "Permission Denied: Running in read-only mode to prevent workspace and database collisions.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    if !active_agent.allowed_tools.contains(&"WriteFile".to_string()) {
                        let err_msg = "Permission Denied: Active agent does not have permission to use WriteFile.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    match sandbox.write_file(&path, &content) {
                        Ok(_) => {
                            let result_msg = format!("Successfully wrote file '{}'", path);
                            db.add_message(session_id, "user", &result_msg)?;
                            println!(">> File written successfully.");
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to write file '{}': {}", path, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::CreateSkill { name, description, schema, code } => {
                    use tokio::io::AsyncWriteExt;
                    println!("\n>> Running Tool: create_skill({})", name);
                    if db.is_read_only() {
                        let err_msg = "Permission Denied: Running in read-only mode to prevent workspace and database collisions.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    if !active_agent.allowed_tools.contains(&"create_skill".to_string()) {
                        let err_msg = "Permission Denied: Active agent does not have permission to use create_skill.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }

                    let skills_dir = &skills_registry.skills_dir;
                    let test_dir = skills_dir.join(format!("test__{}", name));
                    if let Err(e) = std::fs::create_dir_all(&test_dir) {
                        let err_msg = format!("Failed to create temporary test directory: {}", e);
                        db.add_message(session_id, "user", &err_msg)?;
                        continue;
                    }

                    let skill_md_content = format!(
                        "---\nname: {}\ndescription: \"{}\"\nschema: '{}'\n---\n# {}\n{}",
                        name, description, schema, name, description
                    );

                    let md_path = test_dir.join("SKILL.md");
                    let script_path = test_dir.join(format!("{}.py", name));

                    let write_res = std::fs::write(&md_path, skill_md_content)
                        .and_then(|_| std::fs::write(&script_path, &code));

                    if let Err(e) = write_res {
                        let err_msg = format!("Failed to write skill test files: {}", e);
                        db.add_message(session_id, "user", &err_msg)?;
                        let _ = std::fs::remove_dir_all(&test_dir);
                        continue;
                    }

                    // Run syntax check
                    println!(">> Testing skill compilation/syntax check...");
                    let syntax_check = tokio::process::Command::new("python")
                        .arg("-m")
                        .arg("py_compile")
                        .arg(&script_path)
                        .output()
                        .await;

                    match syntax_check {
                        Ok(output) if !output.status.success() => {
                            let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
                            let err_msg = format!("Verification Failed: Python syntax check failed on compilation.\nStderr:\n{}", stderr_str);
                            println!(">> {}", err_msg);
                            db.add_message(session_id, "user", &err_msg)?;
                            let _ = std::fs::remove_dir_all(&test_dir);
                            continue;
                        }
                        Err(e) => {
                            let err_msg = format!("Verification Failed: Python binary execution failed: {}", e);
                            println!(">> {}", err_msg);
                            db.add_message(session_id, "user", &err_msg)?;
                            let _ = std::fs::remove_dir_all(&test_dir);
                            continue;
                        }
                        _ => {}
                    }

                    // Run test execution with empty json input
                    println!(">> Running test execution with empty JSON input...");
                    let test_run = tokio::process::Command::new("python")
                        .arg(&script_path)
                        .stdin(std::process::Stdio::piped())
                        .stdout(std::process::Stdio::piped())
                        .stderr(std::process::Stdio::piped())
                        .spawn();

                    let mut verified = false;
                    let mut err_detail = String::new();

                    match test_run {
                        Ok(mut child) => {
                            if let Some(mut stdin) = child.stdin.take() {
                                let _ = stdin.write_all(b"{}").await;
                            }
                            let duration = std::time::Duration::from_secs(3);
                            match tokio::time::timeout(duration, child.wait()).await {
                                Ok(Ok(status)) => {
                                    let output = child.wait_with_output().await;
                                    match output {
                                        Ok(out) => {
                                            let stderr_str = String::from_utf8_lossy(&out.stderr).to_string();
                                            if !status.success() || stderr_str.contains("Traceback (most recent call last)") {
                                                err_detail = format!("Execution exited with code: {}\nStderr:\n{}", status, stderr_str);
                                            } else {
                                                verified = true;
                                            }
                                        }
                                        Err(e) => {
                                            err_detail = format!("Failed to read process output: {}", e);
                                        }
                                    }
                                }
                                Ok(Err(e)) => {
                                    err_detail = format!("Execution status check error: {}", e);
                                }
                                Err(_) => {
                                    let _ = child.kill().await;
                                    err_detail = "Execution timeout: Script did not finish within 3 seconds when fed empty JSON input.".to_string();
                                }
                            }
                        }
                        Err(e) => {
                            err_detail = format!("Failed to spawn test execution: {}", e);
                        }
                    }

                    if verified {
                        let target_dir = skills_dir.join(&name);
                        if target_dir.exists() {
                            let _ = std::fs::remove_dir_all(&target_dir);
                        }
                        if let Err(e) = std::fs::rename(&test_dir, &target_dir) {
                            let err_msg = format!("Verification passed, but failed to move skill to permanent directory: {}", e);
                            db.add_message(session_id, "user", &err_msg)?;
                        } else {
                            if let Err(e) = skills_registry.reload() {
                                let err_msg = format!("Verification passed, but skills registry reload failed: {}", e);
                                db.add_message(session_id, "user", &err_msg)?;
                            } else {
                                let success_msg = format!("Verification Passed: Dynamic skill '{}' has been created, tested, and hot-swapped into the active registry successfully. It is now active and ready to use.", name);
                                println!(">> {}", success_msg);
                                db.add_message(session_id, "user", &success_msg)?;
                            }
                        }
                    } else {
                        let err_msg = format!("Verification Failed: Dynamic skill '{}' failed during test execution.\nDetails:\n{}", name, err_detail);
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", &err_msg)?;
                        let _ = std::fs::remove_dir_all(&test_dir);
                    }
                }
                ToolCall::CallTool { name, json_args } => {
                    println!("\n>> Running Tool: call_tool({}, {})", name, json_args);
                    if disabled_skills.lock().unwrap().contains(&name) {
                        let err_msg = format!("Permission Denied: Dynamic skill/binary '{}' has been disabled via the Web Dashboard.", name);
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", &err_msg)?;
                        continue;
                    }

                    let has_permission = active_agent.allowed_tools.contains(&name)
                        || (name.starts_with("mcp__") && active_agent.allowed_tools.contains(&"mcp".to_string()));
                    if !has_permission {
                        let err_msg = format!("Permission Denied: Active agent does not have permission to use dynamic skill/binary '{}'.", name);
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", &err_msg)?;
                        continue;
                    }

                    if let Some(skill) = skills_registry.get_skill(&name) {
                        let start_tool = Instant::now();
                        if name.starts_with("mcp__") {
                            let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));
                            let mcp_tool_name = &name[5..]; // Strip "mcp__"
                            match mcp_registry.execute_tool(mcp_tool_name, args_val).await {
                                Ok(output) => {
                                    tracing::info!("MCP tool execution '{}' took {:?}", name, start_tool.elapsed());
                                    let result_msg = format!("MCP Tool '{}' execution output:\n{}", name, output);
                                    let _ = db.add_message_with_vector(session_id, "user", &result_msg, &provider).await;
                                    println!(">> MCP Tool executed successfully.");

                                    // Extract and broadcast screenshot if any
                                    if output.contains("[SCREENSHOT]:") || output.contains("data:image/png;base64,") {
                                        let base64_data = if let Some(pos) = output.find("[SCREENSHOT]:") {
                                            output[pos + 13..].trim().split_whitespace().next().unwrap_or("").to_string()
                                        } else if let Some(pos) = output.find("data:image/png;base64,") {
                                            output[pos + 22..].trim().split_whitespace().next().unwrap_or("").to_string()
                                        } else {
                                            String::new()
                                        };
                                        if !base64_data.is_empty() {
                                            let ws_img = serde_json::json!({
                                                "type": "screenshot",
                                                "image": base64_data
                                            });
                                            if let Ok(msg_str) = serde_json::to_string(&ws_img) {
                                                let _ = ws_tx.send(msg_str);
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("MCP tool execution '{}' failed after {:?}", name, start_tool.elapsed());
                                    let err_msg = format!("MCP Tool '{}' execution failed: {}", name, e);
                                    db.add_message(session_id, "user", &err_msg)?;
                                    println!(">> MCP Tool failed: {}", e);
                                }
                            }
                        } else {
                            let workspace_path = sandbox.base_dir().to_path_buf();
                            match skill.run_ipc(&json_args, &workspace_path).await {
                                Ok(stdout) => {
                                    tracing::info!("Subprocess tool execution '{}' took {:?}", name, start_tool.elapsed());
                                    let result_msg = format!("Skill '{}' execution output:\n{}", name, stdout);
                                    let _ = db.add_message_with_vector(session_id, "user", &result_msg, &provider).await;
                                    println!(">> Skill executed successfully.");

                                    // Extract and broadcast screenshot if any
                                    if stdout.contains("[SCREENSHOT]:") || stdout.contains("data:image/png;base64,") {
                                        let base64_data = if let Some(pos) = stdout.find("[SCREENSHOT]:") {
                                            stdout[pos + 13..].trim().split_whitespace().next().unwrap_or("").to_string()
                                        } else if let Some(pos) = stdout.find("data:image/png;base64,") {
                                            stdout[pos + 22..].trim().split_whitespace().next().unwrap_or("").to_string()
                                        } else {
                                            String::new()
                                        };
                                        if !base64_data.is_empty() {
                                            let ws_img = serde_json::json!({
                                                "type": "screenshot",
                                                "image": base64_data
                                            });
                                            if let Ok(msg_str) = serde_json::to_string(&ws_img) {
                                                let _ = ws_tx.send(msg_str);
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("Subprocess tool execution '{}' failed after {:?}", name, start_tool.elapsed());
                                    let err_msg = format!("Skill '{}' execution failed: {}", name, e);
                                    db.add_message(session_id, "user", &err_msg)?;
                                    println!(">> Skill failed: {}", e);
                                }
                            }
                        }
                    } else if mcp_registry.clients.keys().any(|k| name.starts_with(&(k.to_owned() + "__"))) {
                        let start_mcp = Instant::now();
                        let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));
                        match mcp_registry.execute_tool(&name, args_val).await {
                            Ok(output) => {
                                tracing::info!("MCP tool execution '{}' took {:?}", name, start_mcp.elapsed());
                                let result_msg = format!("MCP Tool '{}' execution output:\n{}", name, output);
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, &provider).await;
                                println!(">> MCP Tool executed successfully.");

                                // Extract and broadcast screenshot if any
                                if output.contains("[SCREENSHOT]:") || output.contains("data:image/png;base64,") {
                                    let base64_data = if let Some(pos) = output.find("[SCREENSHOT]:") {
                                        output[pos + 13..].trim().split_whitespace().next().unwrap_or("").to_string()
                                    } else if let Some(pos) = output.find("data:image/png;base64,") {
                                        output[pos + 22..].trim().split_whitespace().next().unwrap_or("").to_string()
                                    } else {
                                        String::new()
                                    };
                                    if !base64_data.is_empty() {
                                        let ws_img = serde_json::json!({
                                            "type": "screenshot",
                                            "image": base64_data
                                        });
                                        if let Ok(msg_str) = serde_json::to_string(&ws_img) {
                                            let _ = ws_tx.send(msg_str);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("MCP tool execution '{}' failed after {:?}", name, start_mcp.elapsed());
                                let err_msg = format!("MCP Tool '{}' execution failed: {}", name, e);
                                db.add_message(session_id, "user", &err_msg)?;
                                println!(">> MCP Tool failed: {}", e);
                            }
                        }
                    } else if config.security.allowed_binaries.contains(&name) {
                        let cmd_line = format!("{} {}", name, json_args.trim_matches('"'));
                        let start_cmd = Instant::now();
                        match command_runner.run_command(&cmd_line).await {
                            Ok(stdout) => {
                                tracing::info!("Subprocess tool execution '{}' took {:?}", name, start_cmd.elapsed());
                                let result_msg = format!("Command '{}' execution output:\n{}", name, stdout);
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, &provider).await;
                                println!(">> Command executed successfully.");
                            }
                            Err(e) => {
                                tracing::error!("Subprocess tool execution '{}' failed after {:?}", name, start_cmd.elapsed());
                                let err_msg = format!("Command '{}' execution failed: {}", name, e);
                                db.add_message(session_id, "user", &err_msg)?;
                                println!(">> Command failed: {}", e);
                            }
                        }
                    } else {
                        let err_msg = format!("Execution Error: Tool/Skill '{}' is neither registered as a dynamic skill nor whitelisted as an allowed system binary.", name);
                        db.add_message(session_id, "user", &err_msg)?;
                        println!(">> {}", err_msg);
                    }
                }
            }
        }
    }

    let _ = session_router.update(session_id, router);
    Ok(last_response)
}
