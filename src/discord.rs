use crate::config::DiscordConfig;
use crate::channel::{CommunicationChannel, IncomingEvent};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

pub struct DiscordGateway {
    config: DiscordConfig,
    client: reqwest::Client,
}

impl DiscordGateway {
    pub fn new(config: DiscordConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl CommunicationChannel for DiscordGateway {
    async fn listen(&self, tx: Sender<IncomingEvent>) -> Result<(), String> {
        if !self.config.enabled {
            tracing::info!("Discord Gateway is disabled in config.");
            return Ok(());
        }

        let token = self.config.token.clone();
        let allowed_channels = self.config.allowed_channels.clone();

        tokio::spawn(async move {
            let mut backoff = Duration::from_secs(1);
            let max_backoff = Duration::from_secs(60);

            loop {
                tracing::info!("Connecting to Discord Gateway...");
                let ws_url = "wss://gateway.discord.gg/?v=10&encoding=json";
                
                match connect_async(ws_url).await {
                    Ok((ws_stream, _)) => {
                        backoff = Duration::from_secs(1); // Reset backoff on success
                        tracing::info!("Connected to Discord Gateway WebSocket.");

                        let (ws_write, mut ws_read) = ws_stream.split();
                        let mut heartbeat_interval = 41250; // default backup value
                        let session_s = Arc::new(std::sync::Mutex::new(None));

                        // Read Hello
                        if let Some(Ok(Message::Text(text))) = ws_read.next().await {
                            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                if v["op"].as_i64() == Some(10) {
                                    if let Some(interval) = v["d"]["heartbeat_interval"].as_u64() {
                                        heartbeat_interval = interval;
                                        tracing::debug!("Discord Heartbeat Interval: {} ms", heartbeat_interval);
                                    }
                                }
                            }
                        }

                        // Start Heartbeat Loop
                        let hb_write = Arc::new(tokio::sync::Mutex::new(ws_write));
                        
                        let hb_write_clone = hb_write.clone();
                        let session_s_clone = session_s.clone();
                        let hb_task = tokio::spawn(async move {
                            loop {
                                tokio::time::sleep(Duration::from_millis(heartbeat_interval)).await;
                                tracing::debug!("Sending Discord Heartbeat");
                                let s = *session_s_clone.lock().unwrap();
                                let heartbeat_payload = json!({
                                    "op": 1,
                                    "d": s
                                });
                                let mut guard = hb_write_clone.lock().await;
                                if guard.send(Message::Text(heartbeat_payload.to_string())).await.is_err() {
                                    break;
                                }
                            }
                        });

                        // Identify
                        let identify_payload = json!({
                            "op": 2,
                            "d": {
                                "token": format!("Bot {}", token),
                                "intents": 33280, // Guild Messages (1 << 9) | Direct Messages (1 << 12) | Message Content (1 << 15)
                                "properties": {
                                    "os": "windows",
                                    "browser": "hiroshi",
                                    "device": "hiroshi"
                                }
                            }
                        });

                        {
                            let mut guard = hb_write.lock().await;
                            let _ = guard.send(Message::Text(identify_payload.to_string())).await;
                        }

                        // Read Loop
                        while let Some(msg_res) = ws_read.next().await {
                            match msg_res {
                                Ok(Message::Text(text)) => {
                                    if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                        if let Some(s) = v["s"].as_i64() {
                                            *session_s.lock().unwrap() = Some(s);
                                        }

                                        let op = v["op"].as_i64();
                                        let t = v["t"].as_str();

                                        if op == Some(0) && t == Some("MESSAGE_CREATE") {
                                            let author_bot = v["d"]["author"]["bot"].as_bool().unwrap_or(false);
                                            if !author_bot {
                                                let channel_id = v["d"]["channel_id"].as_str().unwrap_or("").to_string();
                                                let content = v["d"]["content"].as_str().unwrap_or("").to_string();

                                                let allowed = allowed_channels.is_empty() || allowed_channels.contains(&channel_id);
                                                if allowed && !content.is_empty() {
                                                    let event = IncomingEvent {
                                                        channel_type: "discord".to_string(),
                                                        session_id: channel_id,
                                                        text: content,
                                                    };
                                                    if tx.send(event).await.is_err() {
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("Discord WebSocket read error: {}", e);
                                    break;
                                }
                                _ => {}
                            }
                        }

                        hb_task.abort();
                    }
                    Err(e) => {
                        tracing::error!("Failed to connect to Discord gateway: {}", e);
                    }
                }

                tracing::info!("Discord Gateway disconnected. Retrying in {:?}...", backoff);
                tokio::time::sleep(backoff).await;
                backoff = std::cmp::min(backoff * 2, max_backoff);
            }
        });

        Ok(())
    }

    async fn send_message(&self, target_id: &str, content: &str) -> Result<(), String> {
        let url = format!("https://discord.com/api/v10/channels/{}/messages", target_id);
        let resp = self.client.post(&url)
            .header("Authorization", format!("Bot {}", self.config.token))
            .json(&json!({
                "content": content
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Discord API error {}: {}", url, err_body));
        }

        Ok(())
    }
}
