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
use std::time::Instant;
use std::io::{self, Write};
use futures_util::StreamExt;

enum ToolCall {
    ReadFile { path: String },
    WriteFile { path: String, content: String },
    CallTool { name: String, json_args: String },
    CreateSkill { name: String, description: String, schema: String, code: String },
    WikiStore { path: String },
    WikiSearch { query: String },
    WebScrape { url: String },
    ApplyPatch { path: String, patch: String },
    Search { engine: String, query: String },
    PdfExtract { path: String },
}

fn parse_tool_calls(content: &str) -> Vec<ToolCall> {
    let mut calls = Vec::new();

    // Parse <search engine="searxng">query</search>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<search") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find(">") {
            let header = &content[abs_start..abs_start + end + 1];
            let engine = if let Some(e_start) = header.find("engine=\"") {
                let e_sub = &header[e_start + 8..];
                if let Some(e_end) = e_sub.find("\"") {
                    e_sub[..e_end].to_string()
                } else {
                    "searxng".to_string()
                }
            } else {
                "searxng".to_string()
            };

            if let Some(close_end) = content[abs_start..].find("</search>") {
                let query = content[abs_start + end + 1..abs_start + close_end].trim().to_string();
                if !query.is_empty() {
                    calls.push(ToolCall::Search { engine, query });
                }
                last_idx = abs_start + close_end + 9;
            } else {
                last_idx = abs_start + end + 1;
            }
        } else {
            break;
        }
    }

    // Parse <pdf_extract path="path"/>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<pdf_extract") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find(">") {
            let header = &content[abs_start..abs_start + end + 1];
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

            if !path.is_empty() {
                calls.push(ToolCall::PdfExtract { path });
            }
            last_idx = abs_start + end + 1;
        } else {
            break;
        }
    }

    // Parse <apply_patch path="path">patch</apply_patch>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<apply_patch") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find(">") {
            let header = &content[abs_start..abs_start + end + 1];
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

            if let Some(close_end) = content[abs_start..].find("</apply_patch>") {
                let patch = content[abs_start + end + 1..abs_start + close_end].trim().to_string();
                if !path.is_empty() && !patch.is_empty() {
                    calls.push(ToolCall::ApplyPatch { path, patch });
                }
                last_idx = abs_start + close_end + 14;
            } else {
                last_idx = abs_start + end + 1;
            }
        } else {
            break;
        }
    }

    // Parse <web_scrape url="url"/> or <web_scrape>url</web_scrape>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<web_scrape") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find(">") {
            let header = &content[abs_start..abs_start + end + 1];
            let url = if let Some(u_start) = header.find("url=\"") {
                let u_sub = &header[u_start + 5..];
                if let Some(u_end) = u_sub.find("\"") {
                    u_sub[..u_end].to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let final_url = if url.is_empty() {
                if let Some(close_end) = content[abs_start..].find("</web_scrape>") {
                    let content_start = abs_start + end + 1;
                    let content_end = abs_start + close_end;
                    content[content_start..content_end].trim().to_string()
                } else {
                    String::new()
                }
            } else {
                url
            };

            if !final_url.is_empty() {
                calls.push(ToolCall::WebScrape { url: final_url });
            }

            if let Some(close_end) = content[abs_start..].find("</web_scrape>") {
                last_idx = abs_start + close_end + 13;
            } else {
                last_idx = abs_start + end + 1;
            }
        } else {
            break;
        }
    }

    // Parse <wiki_store>path</wiki_store>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<wiki_store>") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</wiki_store>") {
            let path = content[abs_start + 12..abs_start + end].trim().to_string();
            calls.push(ToolCall::WikiStore { path });
            last_idx = abs_start + end + 13;
        } else {
            break;
        }
    }

    // Parse <wiki_search>query</wiki_search>
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<wiki_search>") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</wiki_search>") {
            let query = content[abs_start + 13..abs_start + end].trim().to_string();
            calls.push(ToolCall::WikiSearch { query });
            last_idx = abs_start + end + 14;
        } else {
            break;
        }
    }
    
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
    images: Option<Vec<String>>,
    db: Arc<MemoryEngine>,
    provider: Arc<dyn ModelProvider>,
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

    // Run context compaction check
    let _ = crate::compactor::run_context_compaction(session_id, &db, &provider, config).await;

    // Save User Message
    let start_embed = Instant::now();
    let _ = db.add_message_with_vector(session_id, "user", input, provider.as_ref()).await;
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

        // Get context (sliding window) and apply history hygiene
        let raw_history = db.get_context(session_id, context_chars_limit)?;
        let history = crate::hygiene::sanitize_chat_history(raw_history);
        
        let active_name = &router.active_agent;
        print!("\nAssistant [{}] ({}) > ", active_name, session_id);
        io::stdout().flush().map_err(|e| e.to_string())?;

        let start_time = Instant::now();
        let mut first_token = true;
        let mut full_response = String::new();

        let active_images = if loop_turn == 1 { images.clone() } else { None };
        match provider.chat_stream(&system_prompt, history, active_images).await {
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
        let _ = db.add_message_with_vector(session_id, "assistant", &full_response, provider.as_ref()).await;

        // Send intermediate response back to external channel if present
        if let Some(ref chan) = channel {
            let mut formatted_response = format!("🤖 *[{}]*:\n{}", router.active_agent, full_response);
            if config.audio.enabled && config.audio.output_voice_enabled {
                match crate::gateway::audio::generate_voice_response(&full_response, &config.audio, &config.security.sandbox_path).await {
                    Ok(Some(audio_bytes)) => {
                        formatted_response.push_str(&format!("\n\n🔊 *[Voice Response Attached ({} bytes)]*", audio_bytes.len()));
                    }
                    Ok(None) => {}
                    Err(e) => {
                        tracing::error!("TTS speech synthesis failed: {}", e);
                    }
                }
            }
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
                ToolCall::WikiStore { path } => {
                    println!("\n>> Running Tool: wiki_store({})", path);
                    let target_dir = if path.trim().is_empty() {
                        crate::config::resolve_home_path(&config.wiki.wiki_dir)
                    } else {
                        crate::config::resolve_home_path(&path)
                    };
                    match crate::memory::wiki::index_wiki_directory(&target_dir, provider.as_ref()) {
                        Ok(_) => {
                            let result_msg = format!("Successfully indexed memory wiki directory: {:?}", target_dir);
                            db.add_message(session_id, "user", &result_msg)?;
                            println!(">> Wiki directory indexed successfully.");
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to index memory wiki directory '{:?}': {}", target_dir, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::WebScrape { url } => {
                    println!("\n>> Running Tool: web_scrape({})", url);
                    if !active_agent.allowed_tools.contains(&"WebScrape".to_string()) {
                        let err_msg = "Permission Denied: Active agent does not have permission to use WebScrape.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    match crate::tools::scraper::scrape_url(&url, &config.scraper).await {
                        Ok(markdown) => {
                            let result_msg = format!("Scraped content of '{}':\n{}", url, markdown);
                            let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
                            println!(">> Web scrape completed successfully.");
                        }
                        Err(e) => {
                            let err_msg = format!("Web scrape failed for '{}': {}", url, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::ApplyPatch { path, patch } => {
                    println!("\n>> Running Tool: apply_patch({})", path);
                    if db.is_read_only() {
                        let err_msg = "Permission Denied: Running in read-only mode to prevent workspace and database collisions.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    if !active_agent.allowed_tools.contains(&"WriteFile".to_string()) {
                        let err_msg = "Permission Denied: Active agent does not have permission to modify files.";
                        println!(">> {}", err_msg);
                        db.add_message(session_id, "user", err_msg)?;
                        continue;
                    }
                    match sandbox.read_file(&path) {
                        Ok(original) => {
                            match crate::tools::diff::apply_line_patch(&original, &patch) {
                                Ok(patched) => {
                                    match sandbox.write_file(&path, &patched) {
                                        Ok(_) => {
                                            let result_msg = format!("Successfully applied code patch to '{}'. Content updated.", path);
                                            db.add_message(session_id, "user", &result_msg)?;
                                            println!(">> Code patch applied successfully.");
                                        }
                                        Err(e) => {
                                            let err_msg = format!("Failed to write patched file '{}': {}", path, e);
                                            db.add_message(session_id, "user", &err_msg)?;
                                            println!(">> Tool failed: {}", e);
                                        }
                                    }
                                }
                                Err(e) => {
                                    let err_msg = format!("Failed to apply patch hunks to '{}': {}", path, e);
                                    db.add_message(session_id, "user", &err_msg)?;
                                    println!(">> Patch match failed: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to read target file '{}' for patch application: {}", path, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::Search { engine, query } => {
                    println!("\n>> Running Tool: search({}, {})", engine, query);
                    let mut search_res = Err("Engine not matched".to_string());
                    if engine == "searxng" {
                        if let Some(ref base_url) = config.advanced_search.searxng_url {
                            search_res = crate::tools::search::search_searxng(&query, base_url).await
                                .map_err(|e| e.to_string());
                        } else {
                            search_res = Err("SearXNG URL is not configured.".to_string());
                        }
                    }

                    if search_res.is_err() && config.advanced_search.fallback_to_ddg {
                        println!(">> SearXNG failed or not configured. Triggering fallback to DuckDuckGo...");
                        let ddg_provider = crate::tools::search::DuckDuckGoSearchProvider::new();
                        search_res = crate::tools::search::SearchProvider::search(&ddg_provider, &query).await;
                    }

                    match search_res {
                        Ok(res) => {
                            let _ = db.add_message_with_vector(session_id, "user", &res, provider.as_ref()).await;
                            println!(">> Search completed successfully.");
                        }
                        Err(e) => {
                            let err_msg = format!("Search failed for '{}': {}", query, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::PdfExtract { path } => {
                    println!("\n>> Running Tool: pdf_extract({})", path);
                    match sandbox.sanitize_path(&path) {
                        Ok(resolved_path) => {
                            let limit = config.advanced_search.max_pdf_size_bytes;
                            match crate::tools::pdf::extract_pdf_to_markdown(&resolved_path, limit) {
                                Ok(markdown) => {
                                    let _ = db.add_message_with_vector(session_id, "user", &markdown, provider.as_ref()).await;
                                    println!(">> PDF extraction completed successfully.");
                                }
                                Err(e) => {
                                    let err_msg = format!("Failed to extract PDF '{}': {}", path, e);
                                    db.add_message(session_id, "user", &err_msg)?;
                                    println!(">> Tool failed: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            let err_msg = format!("Sandbox validation failed for path '{}': {}", path, e);
                            db.add_message(session_id, "user", &err_msg)?;
                            println!(">> Tool failed: {}", e);
                        }
                    }
                }
                ToolCall::WikiSearch { query } => {
                    println!("\n>> Running Tool: wiki_search({})", query);
                    match provider.get_embeddings(&query).await {
                        Ok(emb) => {
                            let threshold = config.wiki.similarity_threshold;
                            match crate::memory::wiki::search_wiki(&emb, threshold, 5) {
                                Ok(matches) => {
                                    let mut response_content = format!("Memory Wiki matches for '{}':\n", query);
                                    if matches.is_empty() {
                                        response_content.push_str("No highly-similar blocks found above similarity threshold.\n");
                                    } else {
                                        for (idx, (chunk, score)) in matches.iter().enumerate() {
                                            response_content.push_str(&format!("\n--- Match {} (Similarity: {:.2}) ---\n{}\n", idx + 1, score, chunk));
                                        }
                                    }
                                    db.add_message(session_id, "user", &response_content)?;
                                    println!(">> Search completed successfully.");
                                }
                                Err(e) => {
                                    let err_msg = format!("Failed to execute cosine search: {}", e);
                                    db.add_message(session_id, "user", &err_msg)?;
                                    println!(">> Tool failed: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to generate embedding for query '{}': {}", query, e);
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

                    if name == "speak_response" {
                        let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));
                        let text_input = args_val["text"].as_str().unwrap_or(&json_args);
                        
                        println!(">> Synthesizing speech for response: '{}'", text_input);
                        let tts_engine = crate::gateway::voice::VoiceSynthesisEngine::new(
                            &std::env::var("OPENAI_API_KEY").unwrap_or_default()
                        );
                        match tts_engine.synthesize_speech(text_input).await {
                            Ok(audio_bytes) => {
                                println!(">> Speech synthesized successfully ({} bytes).", audio_bytes.len());
                                let result_msg = format!("System Notification: Speech synthesized and attached successfully ({} bytes).", audio_bytes.len());
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
                            }
                            Err(e) => {
                                let err_msg = format!("Speech synthesis failed: {}", e);
                                db.add_message(session_id, "user", &err_msg)?;
                            }
                        }
                        continue;
                    }

                    if name == "desktop_screenshot" || name == "desktop_click" || name == "desktop_type" {
                        let vision_vault = sandbox.base_dir().to_path_buf();
                        let vision = crate::tools::vision::DesktopVisionEngine::new(&vision_vault);
                        let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));

                        let result = match name.as_str() {
                            "desktop_screenshot" => {
                                vision.desktop_screenshot().map(|bytes| {
                                    format!("Screenshot captured successfully ({} bytes).", bytes.len())
                                })
                            }
                            "desktop_click" => {
                                let x = args_val["x"].as_u64().unwrap_or(0) as u32;
                                let y = args_val["y"].as_u64().unwrap_or(0) as u32;
                                vision.desktop_click(x, y)
                            }
                            "desktop_type" => {
                                let text = args_val["text"].as_str().unwrap_or("");
                                vision.desktop_type(text)
                            }
                            _ => unreachable!(),
                        };

                        match result {
                            Ok(output) => {
                                let result_msg = format!("Tool '{}' output:\n{}", name, output);
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
                            }
                            Err(e) => {
                                let err_msg = format!("Tool '{}' error: {}", name, e);
                                db.add_message(session_id, "user", &err_msg)?;
                            }
                        }
                        continue;
                    }

                    if name == "fs_list" || name == "fs_read" || name == "fs_write" || name == "fs_move" {
                        let workspace_path = sandbox.base_dir().to_path_buf();
                        let fs_sandbox = crate::tools::fs::FilesystemSandbox::new(&workspace_path);
                        let args_val: serde_json::Value = serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));
                        
                        let result = match name.as_str() {
                            "fs_list" => {
                                let path = args_val["path"].as_str().unwrap_or(".");
                                fs_sandbox.fs_list(path).map(|v| format!("{:?}", v))
                            }
                            "fs_read" => {
                                let path = args_val["path"].as_str().unwrap_or("");
                                fs_sandbox.fs_read(path)
                            }
                            "fs_write" => {
                                let path = args_val["path"].as_str().unwrap_or("");
                                let content = args_val["content"].as_str().unwrap_or("");
                                fs_sandbox.fs_write(path, content).map(|_| "File written successfully".to_string())
                            }
                            "fs_move" => {
                                let src = args_val["src"].as_str().unwrap_or("");
                                let dest = args_val["dest"].as_str().unwrap_or("");
                                fs_sandbox.fs_move(src, dest).map(|_| "File moved successfully".to_string())
                            }
                            _ => unreachable!(),
                        };

                        match result {
                            Ok(output) => {
                                let result_msg = format!("Tool '{}' output:\n{}", name, output);
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
                            }
                            Err(e) => {
                                let err_msg = format!("Tool '{}' error: {}", name, e);
                                db.add_message(session_id, "user", &err_msg)?;
                            }
                        }
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
                                    let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
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
                                    let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
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
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
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
                                let _ = db.add_message_with_vector(session_id, "user", &result_msg, provider.as_ref()).await;
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
