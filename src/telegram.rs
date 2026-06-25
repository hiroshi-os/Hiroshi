use crate::config::TelegramConfig;
use crate::db::MemoryEngine;
use crate::provider::OllamaProvider;
use crate::agents::SessionRouter;
use crate::sandbox::WorkspaceSandbox;
use crate::sandbox_cmd::SafeCommandRunner;
use crate::skills::SkillsRegistry;
use crate::mcp::McpRegistry;

use std::sync::Arc;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;

#[derive(Deserialize, Debug)]
struct TelegramResponse<T> {
    ok: bool,
    result: Option<T>,
}

#[derive(Deserialize, Debug)]
struct TelegramUpdate {
    update_id: i64,
    message: Option<TelegramMessage>,
}

#[derive(Deserialize, Debug)]
struct TelegramMessage {
    message_id: i64,
    from: Option<TelegramUser>,
    chat: TelegramChat,
    text: Option<String>,
}

#[derive(Deserialize, Debug)]
struct TelegramUser {
    id: i64,
}

#[derive(Deserialize, Debug)]
struct TelegramChat {
    id: i64,
}

#[derive(Serialize, Debug)]
struct SendMessageRequest {
    chat_id: i64,
    text: String,
}

#[derive(Serialize, Debug)]
struct EditMessageRequest {
    chat_id: i64,
    message_id: i64,
    text: String,
    parse_mode: Option<String>,
}

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

pub struct TelegramGateway {
    config: TelegramConfig,
    db: Arc<MemoryEngine>,
    provider: Arc<OllamaProvider>,
    session_router: Arc<SessionRouter>,
    skills_registry: Arc<SkillsRegistry>,
    mcp_registry: Arc<McpRegistry>,
    command_runner: Arc<SafeCommandRunner>,
    workspace_path: std::path::PathBuf,
    client: reqwest::Client,
}

impl TelegramGateway {
    pub fn new(
        config: TelegramConfig,
        db: Arc<MemoryEngine>,
        provider: Arc<OllamaProvider>,
        session_router: Arc<SessionRouter>,
        skills_registry: Arc<SkillsRegistry>,
        mcp_registry: Arc<McpRegistry>,
        command_runner: Arc<SafeCommandRunner>,
        workspace_path: std::path::PathBuf,
    ) -> Self {
        Self {
            config,
            db,
            provider,
            session_router,
            skills_registry,
            mcp_registry,
            command_runner,
            workspace_path,
            client: reqwest::Client::new(),
        }
    }

    pub fn start(self, shutdown_token: tokio_util::sync::CancellationToken) {
        if !self.config.enabled {
            tracing::info!("Telegram Gateway is disabled in config.");
            return;
        }

        let workspace_path = self.workspace_path.clone();

        tokio::spawn(async move {
            tracing::info!("Telegram Gateway listening service started.");
            let mut offset = 0;
            let token = &self.config.token;
            let url_get_updates = format!("https://api.telegram.org/bot{}/getUpdates", token);

            loop {
                let poll_url = format!("{}?offset={}&timeout=30", url_get_updates, offset);
                let send_req = self.client.get(&poll_url).send();
                
                let resp = tokio::select! {
                    _ = shutdown_token.cancelled() => {
                        tracing::info!("Telegram Gateway shutting down poll loop...");
                        break;
                    }
                    r = send_req => r,
                };

                match resp {
                    Ok(resp) => {
                        if let Ok(tg_resp) = resp.json::<TelegramResponse<Vec<TelegramUpdate>>>().await {
                            if tg_resp.ok {
                                if let Some(updates) = tg_resp.result {
                                    for update in updates {
                                        offset = update.update_id + 1;
                                        if let Some(msg) = update.message {
                                            let from_id = msg.from.map(|f| f.id).unwrap_or(0);
                                            
                                            if !self.config.allowed_user_ids.contains(&from_id) {
                                                tracing::warn!("Telegram Security: Blocked unauthorized message from user: {}", from_id);
                                                continue;
                                            }

                                            if let Some(text) = msg.text {
                                                let db_clone = self.db.clone();
                                                let provider_clone = self.provider.clone();
                                                let session_router_clone = self.session_router.clone();
                                                let skills_registry_clone = self.skills_registry.clone();
                                                let mcp_registry_clone = self.mcp_registry.clone();
                                                let command_runner_clone = self.command_runner.clone();
                                                let sandbox_clone = Arc::new(WorkspaceSandbox::new(workspace_path.clone()));
                                                let token_clone = token.clone();
                                                let client_clone = self.client.clone();
                                                let chat_id = msg.chat.id;

                                                tokio::spawn(async move {
                                                    if let Err(e) = handle_telegram_message(
                                                        chat_id,
                                                        text,
                                                        db_clone,
                                                        provider_clone,
                                                        session_router_clone,
                                                        skills_registry_clone,
                                                        mcp_registry_clone,
                                                        command_runner_clone,
                                                        sandbox_clone,
                                                        &token_clone,
                                                        &client_clone,
                                                    ).await {
                                                        eprintln!("[Telegram Error] Failed to process message: {}", e);
                                                    }
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Telegram Network Error] {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        });
    }
}

async fn handle_telegram_message(
    chat_id: i64,
    text: String,
    db: Arc<MemoryEngine>,
    provider: Arc<OllamaProvider>,
    session_router: Arc<SessionRouter>,
    skills_registry: Arc<SkillsRegistry>,
    mcp_registry: Arc<McpRegistry>,
    command_runner: Arc<SafeCommandRunner>,
    sandbox: Arc<WorkspaceSandbox>,
    token: &str,
    client: &reqwest::Client,
) -> Result<(), String> {
    let session_id = format!("telegram_{}", chat_id);
    let mut router = session_router.get_or_create(&session_id)?;
    let _ = db.add_message_with_vector("user", &text, &provider).await;

    let query_vector = provider.get_embeddings(&text).await.unwrap_or_default();
    let rag_matches = if !query_vector.is_empty() {
        db.search_vector_rag(&query_vector, 3)?
    } else {
        db.search_rag_history(&text, 3)?
    };
    let mut rag_context = String::new();
    if !rag_matches.is_empty() {
        rag_context.push_str("\n--- Relevant historical memory context ---\n");
        for m in rag_matches {
            rag_context.push_str(&format!("{}: {}\n", m.role, m.content));
        }
        rag_context.push_str("------------------------------------------\n");
    }

    let send_url = format!("https://api.telegram.org/bot{}/sendMessage", token);
    let placeholder_payload = SendMessageRequest {
        chat_id,
        text: "Thinking...".to_string(),
    };
    
    let placeholder_resp = client.post(&send_url)
        .json(&placeholder_payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let placeholder_body = placeholder_resp.json::<TelegramResponse<TelegramMessage>>().await
        .map_err(|e| e.to_string())?;

    let message_id = placeholder_body.result
        .ok_or_else(|| "Failed to send initial message".to_string())?
        .message_id;

    let edit_url = format!("https://api.telegram.org/bot{}/editMessageText", token);
    
    let mut loop_turn = 0;
    let max_loop_turns = 5;

    while loop_turn < max_loop_turns {
        loop_turn += 1;
        
        let active_agent = router.get_active_agent()
            .ok_or_else(|| "No active agent found".to_string())?;

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
            "{}\nHand-off Rule: {}\nAllowed Tools: {:?}\nTo run a tool, you MUST output the request exactly using XML tags:\n- To read a file: <read_file>path/to/file</read_file>\n- To write/overwrite a file: <write_file path=\"path/to/file\">file content</write_file>\n{}\n\n{}",
            active_agent.prompt,
            active_agent.hand_off,
            active_agent.allowed_tools,
            dynamic_skills_str,
            rag_context
        );
        let history = db.get_context(16384)?;

        let mut stream = provider.chat_stream(&system_prompt, history).await?;
        let mut full_response = String::new();
        let mut last_edit_time = std::time::Instant::now();

        while let Some(chunk_res) = stream.next().await {
            if let Ok(text) = chunk_res {
                full_response.push_str(&text);
                
                if last_edit_time.elapsed() > Duration::from_millis(1500) && !full_response.trim().is_empty() {
                    let edit_payload = EditMessageRequest {
                        chat_id,
                        message_id,
                        text: format!("🤖 *[{}]*:\n{}", router.active_agent, full_response),
                        parse_mode: Some("Markdown".to_string()),
                    };
                    let _ = client.post(&edit_url).json(&edit_payload).send().await;
                    last_edit_time = std::time::Instant::now();
                }
            }
        }

        if full_response.is_empty() {
            break;
        }

        let _ = db.add_message_with_vector("assistant", &full_response, &provider).await;

        let edit_payload = EditMessageRequest {
            chat_id,
            message_id,
            text: format!("🤖 *[{}]*:\n{}", router.active_agent, full_response),
            parse_mode: Some("Markdown".to_string()),
        };
        let _ = client.post(&edit_url).json(&edit_payload).send().await;

        if let Some(next_agent) = router.detect_handoff(&full_response) {
            router.switch_agent(&next_agent);
            let _ = session_router.update(&session_id, router.clone());
            continue;
        }

        let tool_calls = parse_tool_calls(&full_response);
        if tool_calls.is_empty() {
            break;
        }

        for tool in tool_calls {
            match tool {
                ToolCall::ReadFile { path } => {
                    if !active_agent.allowed_tools.contains(&"ReadFile".to_string()) {
                        let err_msg = "Permission Denied: Active agent does not have permission to use ReadFile.";
                        db.add_message("user", err_msg)?;
                        continue;
                    }
                    match sandbox.read_file(&path) {
                        Ok(content) => {
                            let result_msg = format!("File content of '{}':\n{}", path, content);
                            db.add_message("user", &result_msg)?;
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to read file '{}': {}", path, e);
                            db.add_message("user", &err_msg)?;
                        }
                    }
                }
                ToolCall::WriteFile { path, content } => {
                    if !active_agent.allowed_tools.contains(&"WriteFile".to_string()) {
                        let err_msg = "Permission Denied: Active agent does not have permission to use WriteFile.";
                        db.add_message("user", err_msg)?;
                        continue;
                    }
                    match sandbox.write_file(&path, &content) {
                        Ok(_) => {
                            let result_msg = format!("Successfully wrote file '{}'", path);
                            db.add_message("user", &result_msg)?;
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to write file '{}': {}", path, e);
                            db.add_message("user", &err_msg)?;
                        }
                    }
                }
                ToolCall::CallTool { name, json_args } => {
                    let has_permission = active_agent.allowed_tools.contains(&name)
                        || (name.starts_with("mcp__") && active_agent.allowed_tools.contains(&"mcp".to_string()));
                    if !has_permission {
                        let err_msg = format!("Permission Denied: Active agent does not have permission to use dynamic skill/binary '{}'.", name);
                        db.add_message("user", &err_msg)?;
                        continue;
                    }

                    // Resolving actual workspace path
                    let actual_workspace = sandbox.sanitize_path(".").unwrap_or(std::path::PathBuf::from("."));

                    if let Some(skill) = skills_registry.get_skill(&name) {
                        if name.starts_with("mcp__") {
                            let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));
                            let mcp_tool_name = &name[5..]; // Strip "mcp__"
                            match mcp_registry.execute_tool(mcp_tool_name, args_val).await {
                                Ok(output) => {
                                    let result_msg = format!("MCP Tool '{}' execution output:\n{}", name, output);
                                    db.add_message("user", &result_msg)?;
                                }
                                Err(e) => {
                                    let err_msg = format!("MCP Tool '{}' execution failed: {}", name, e);
                                    db.add_message("user", &err_msg)?;
                                }
                            }
                        } else {
                            match skill.run_ipc(&json_args, &actual_workspace).await {
                                Ok(stdout) => {
                                    let result_msg = format!("Skill '{}' execution output:\n{}", name, stdout);
                                    db.add_message("user", &result_msg)?;
                                }
                                Err(e) => {
                                    let err_msg = format!("Skill '{}' execution failed: {}", name, e);
                                    db.add_message("user", &err_msg)?;
                                }
                            }
                        }
                    } else if mcp_registry.clients.keys().any(|k| name.starts_with(&(k.to_owned() + "__"))) {
                        let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));
                        match mcp_registry.execute_tool(&name, args_val).await {
                            Ok(output) => {
                                let result_msg = format!("MCP Tool '{}' execution output:\n{}", name, output);
                                db.add_message("user", &result_msg)?;
                            }
                            Err(e) => {
                                let err_msg = format!("MCP Tool '{}' execution failed: {}", name, e);
                                db.add_message("user", &err_msg)?;
                            }
                        }
                    } else {
                        // Check if whitelisted command (we assume commands are run via system allowed binaries)
                        // Note: allowed_binaries can run directly
                        let cmd_line = format!("{} {}", name, json_args.trim_matches('"'));
                        match command_runner.run_command(&cmd_line).await {
                            Ok(stdout) => {
                                let result_msg = format!("Command '{}' execution output:\n{}", name, stdout);
                                db.add_message("user", &result_msg)?;
                            }
                            Err(e) => {
                                let err_msg = format!("Command '{}' execution failed: {}", name, e);
                                db.add_message("user", &err_msg)?;
                            }
                        }
                    }
                }
            }
        }
    }

    let _ = session_router.update(&session_id, router);
    Ok(())
}
