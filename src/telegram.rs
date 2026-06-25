use crate::config::TelegramConfig;
use crate::db::MemoryEngine;
use crate::provider::OllamaProvider;
use crate::agents::AgentRouter;
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

pub struct TelegramGateway {
    config: TelegramConfig,
    db: Arc<MemoryEngine>,
    provider: Arc<OllamaProvider>,
    agents_path: std::path::PathBuf,
    client: reqwest::Client,
}

impl TelegramGateway {
    pub fn new(
        config: TelegramConfig,
        db: Arc<MemoryEngine>,
        provider: Arc<OllamaProvider>,
        agents_path: std::path::PathBuf,
    ) -> Self {
        Self {
            config,
            db,
            provider,
            agents_path,
            client: reqwest::Client::new(),
        }
    }

    pub fn start(self) {
        if !self.config.enabled {
            println!("[Telegram] Gateway is disabled in config.");
            return;
        }

        tokio::spawn(async move {
            println!("[Telegram] Gateway listening service started.");
            let mut offset = 0;
            let token = &self.config.token;
            let url_get_updates = format!("https://api.telegram.org/bot{}/getUpdates", token);

            loop {
                let poll_url = format!("{}?offset={}&timeout=30", url_get_updates, offset);
                match self.client.get(&poll_url).send().await {
                    Ok(resp) => {
                        if let Ok(tg_resp) = resp.json::<TelegramResponse<Vec<TelegramUpdate>>>().await {
                            if tg_resp.ok {
                                if let Some(updates) = tg_resp.result {
                                    for update in updates {
                                        offset = update.update_id + 1;
                                        if let Some(msg) = update.message {
                                            let from_id = msg.from.map(|f| f.id).unwrap_or(0);
                                            
                                            // Security ACL check
                                            if !self.config.allowed_user_ids.contains(&from_id) {
                                                println!("[Telegram Security] Blocked unauthorized message from user: {}", from_id);
                                                continue;
                                            }

                                            if let Some(text) = msg.text {
                                                let db_clone = self.db.clone();
                                                let provider_clone = self.provider.clone();
                                                let agents_path_clone = self.agents_path.clone();
                                                let token_clone = token.clone();
                                                let client_clone = self.client.clone();
                                                let chat_id = msg.chat.id;

                                                tokio::spawn(async move {
                                                    if let Err(e) = handle_telegram_message(
                                                        chat_id,
                                                        text,
                                                        db_clone,
                                                        provider_clone,
                                                        agents_path_clone,
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
    agents_path: std::path::PathBuf,
    token: &str,
    client: &reqwest::Client,
) -> Result<(), String> {
    // 1. Parse Agent Router state
    let mut router = AgentRouter::load_from_file(&agents_path)?;

    // 2. Save User Message
    db.add_message("user", &text)?;

    // 3. FTS5 RAG Matcher search
    let rag_matches = db.search_rag_history(&text, 3)?;
    let mut rag_context = String::new();
    if !rag_matches.is_empty() {
        rag_context.push_str("\n--- Relevant historical memory context ---\n");
        for m in rag_matches {
            rag_context.push_str(&format!("{}: {}\n", m.role, m.content));
        }
        rag_context.push_str("------------------------------------------\n");
    }

    // 4. Send typing placeholder to Telegram
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

    // 5. Query Ollama and route stream edits
    let edit_url = format!("https://api.telegram.org/bot{}/editMessageText", token);
    
    let mut loop_turn = 0;
    let max_loop_turns = 5;

    while loop_turn < max_loop_turns {
        loop_turn += 1;
        
        let active_agent = router.get_active_agent()
            .ok_or_else(|| "No active agent found".to_string())?;

        let system_prompt = format!("{}\n{}", active_agent.prompt, rag_context);
        let history = db.get_context(16384)?; // Context window char limit approx

        let mut stream = provider.chat_stream(&system_prompt, history).await?;
        let mut full_response = String::new();
        let mut last_edit_time = std::time::Instant::now();

        while let Some(chunk_res) = stream.next().await {
            if let Ok(text) = chunk_res {
                full_response.push_str(&text);
                
                // Throttle telegram edits to respect rate limits (edit at most once per 1.5 seconds)
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

        // Save assistant response
        db.add_message("assistant", &full_response)?;

        // Final message sync
        let edit_payload = EditMessageRequest {
            chat_id,
            message_id,
            text: format!("🤖 *[{}]*:\n{}", router.active_agent, full_response),
            parse_mode: Some("Markdown".to_string()),
        };
        let _ = client.post(&edit_url).json(&edit_payload).send().await;

        // Detect if hand-off is triggered
        if let Some(next_agent) = router.detect_handoff(&full_response) {
            router.switch_agent(&next_agent);
            // Run loop again with new agent prompt!
            continue;
        }
        break;
    }

    Ok(())
}
