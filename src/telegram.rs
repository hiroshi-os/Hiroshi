use crate::config::TelegramConfig;
use crate::channel::{CommunicationChannel, ChannelMessage, ChannelOrigin, ChatType};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc::Sender;

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

pub struct TelegramGateway {
    config: TelegramConfig,
    client: reqwest::Client,
}

impl TelegramGateway {
    pub fn new(config: TelegramConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl CommunicationChannel for TelegramGateway {
    async fn listen(&self, tx: Sender<ChannelMessage>) -> Result<(), String> {
        if !self.config.enabled {
            tracing::info!("Telegram Gateway is disabled in config.");
            return Ok(());
        }

        let config = self.config.clone();
        let client = self.client.clone();

        tokio::spawn(async move {
            tracing::info!("Telegram Gateway listening service started.");
            let mut offset = 0;
            let token = &config.token;
            let url_get_updates = format!("https://api.telegram.org/bot{}/getUpdates", token);
            let mut backoff = Duration::from_secs(1);
            let max_backoff = Duration::from_secs(60);

            loop {
                let poll_url = format!("{}?offset={}&timeout=30", url_get_updates, offset);
                let resp = client.get(&poll_url).send().await;

                match resp {
                    Ok(resp) => {
                        backoff = Duration::from_secs(1); // Reset backoff
                        if let Ok(tg_resp) = resp.json::<TelegramResponse<Vec<TelegramUpdate>>>().await {
                            if tg_resp.ok {
                                if let Some(updates) = tg_resp.result {
                                    for update in updates {
                                        offset = update.update_id + 1;
                                        if let Some(msg) = update.message {
                                            let from_id = msg.from.map(|f| f.id).unwrap_or(0);
                                            
                                            if !config.allowed_user_ids.contains(&from_id) {
                                                tracing::warn!("Telegram Security: Blocked unauthorized message from user: {}", from_id);
                                                continue;
                                            }

                                            if let Some(text) = msg.text {
                                                let event = ChannelMessage {
                                                    origin: ChannelOrigin::Telegram,
                                                    chat_type: ChatType::Direct,
                                                    sender_id: from_id.to_string(),
                                                    display_name: None,
                                                    session_key: ChannelMessage::build_session_key(
                                                        "default", &ChannelOrigin::Telegram, &ChatType::Direct, &msg.chat.id.to_string()
                                                    ),
                                                    text,
                                                    attachments: vec![],
                                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                                    is_bot: false,
                                                };
                                                if tx.send(event).await.is_err() {
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("[Telegram Network Error] {}. Retrying in {:?}...", e, backoff);
                        tokio::time::sleep(backoff).await;
                        backoff = std::cmp::min(backoff * 2, max_backoff);
                    }
                }
            }
        });

        Ok(())
    }

    async fn send_message(&self, target_id: &str, content: &str) -> Result<(), String> {
        let chat_id: i64 = target_id.parse().map_err(|e| format!("Invalid target_id for Telegram: {}", e))?;
        let url = format!("https://api.telegram.org/bot{}/sendMessage", self.config.token);
        
        let payload = SendMessageRequest {
            chat_id,
            text: content.to_string(),
        };

        let resp = self.client.post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Telegram API error: {}", err_body));
        }

        Ok(())
    }
}
