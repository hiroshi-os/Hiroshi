use crate::config::SlackConfig;
use crate::channel::{CommunicationChannel, ChannelMessage, ChannelOrigin, ChatType};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

pub struct SlackGateway {
    config: SlackConfig,
    client: reqwest::Client,
}

impl SlackGateway {
    pub fn new(config: SlackConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    async fn get_websocket_url(&self) -> Result<String, String> {
        let resp = self.client.post("https://slack.com/api/apps.connections.open")
            .header("Authorization", format!("Bearer {}", self.config.app_token))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if body["ok"].as_bool() == Some(true) {
            if let Some(url) = body["url"].as_str() {
                return Ok(url.to_string());
            }
        }
        Err(format!("Failed to open Slack connection: {:?}", body))
    }
}

#[async_trait]
impl CommunicationChannel for SlackGateway {
    async fn listen(&self, tx: Sender<ChannelMessage>) -> Result<(), String> {
        if !self.config.enabled {
            tracing::info!("Slack Gateway is disabled in config.");
            return Ok(());
        }

        let gateway = Arc::new(Self::new(self.config.clone()));

        tokio::spawn(async move {
            let mut backoff = Duration::from_secs(1);
            let max_backoff = Duration::from_secs(60);

            loop {
                tracing::info!("Opening Slack Socket Mode connection...");
                match gateway.get_websocket_url().await {
                    Ok(url) => {
                        tracing::info!("Connecting to Slack Socket Mode WebSocket: {}", url);
                        match connect_async(&url).await {
                            Ok((ws_stream, _)) => {
                                backoff = Duration::from_secs(1); // Reset backoff
                                tracing::info!("Connected to Slack WebSocket.");

                                let (ws_write, mut ws_read) = ws_stream.split();
                                let ws_write = Arc::new(tokio::sync::Mutex::new(ws_write));

                                while let Some(msg_res) = ws_read.next().await {
                                    match msg_res {
                                        Ok(Message::Text(text)) => {
                                            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                                // Always send acknowledgement if envelope_id is present
                                                if let Some(envelope_id) = v["envelope_id"].as_str() {
                                                    let ack = json!({ "envelope_id": envelope_id });
                                                    let mut guard = ws_write.lock().await;
                                                    let _ = guard.send(Message::Text(ack.to_string())).await;
                                                }

                                                // Process messages
                                                if v["type"].as_str() == Some("events_api") {
                                                    let event = &v["payload"]["event"];
                                                    if event["type"].as_str() == Some("message") {
                                                        // Ignore message if it has a subtype (like bot_message) or bot_id
                                                        let is_bot = event["subtype"].as_str().is_some() 
                                                            || event["bot_id"].as_str().is_some();
                                                        
                                                        let channel_id = event["channel"].as_str().unwrap_or("").to_string();
                                                        let text = event["text"].as_str().unwrap_or("").to_string();

                                                        if !is_bot && !channel_id.is_empty() && !text.is_empty() {
                                                            let user_id = event["user"].as_str().unwrap_or("").to_string();
                                                            let incoming = ChannelMessage {
                                                                origin: ChannelOrigin::Slack,
                                                                chat_type: ChatType::Group,
                                                                sender_id: user_id,
                                                                display_name: None,
                                                                session_key: ChannelMessage::build_session_key(
                                                                    "default", &ChannelOrigin::Slack, &ChatType::Group, &channel_id
                                                                ),
                                                                text,
                                                                attachments: vec![],
                                                                timestamp: chrono::Utc::now().timestamp_millis(),
                                                                is_bot: false,
                                                            };
                                                            if tx.send(incoming).await.is_err() {
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Ok(_) => {}
                                        Err(e) => {
                                            tracing::error!("Slack WebSocket read error: {}", e);
                                            break;
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to connect to Slack socket: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to get Slack websocket URL: {}", e);
                    }
                }

                tracing::info!("Slack Gateway disconnected. Retrying in {:?}...", backoff);
                tokio::time::sleep(backoff).await;
                backoff = std::cmp::min(backoff * 2, max_backoff);
            }
        });

        Ok(())
    }

    async fn send_message(&self, target_id: &str, content: &str) -> Result<(), String> {
        let url = "https://slack.com/api/chat.postMessage";
        let resp = self.client.post(url)
            .header("Authorization", format!("Bearer {}", self.config.bot_token))
            .json(&json!({
                "channel": target_id,
                "text": content
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        if body["ok"].as_bool() != Some(true) {
            return Err(format!("Slack API error: {:?}", body));
        }

        Ok(())
    }
}
