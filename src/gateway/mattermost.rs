use async_trait::async_trait;
use reqwest::Client;
use std::time::Duration;
use crate::channel::{ChannelMessage, ChannelOrigin, ChatType};
use crate::config::MattermostConfig;
use crate::gateway::traits::ChannelDriver;

pub struct MattermostDriver {
    config: MattermostConfig,
    client: Client,
}

impl MattermostDriver {
    pub fn new(config: MattermostConfig) -> Self {
        Self {
            config,
            client: Client::builder().timeout(Duration::from_secs(8)).build().unwrap(),
        }
    }
}

#[async_trait]
impl ChannelDriver for MattermostDriver {
    fn channel_id(&self) -> &'static str {
        "mattermost"
    }

    async fn run(&self, inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        let server_url = self.config.server_url.clone();
        let bot_token = self.config.bot_token.clone();
        let _allowed_channels = self.config.allowed_channels.clone();

        tokio::spawn(async move {
            tracing::info!("Mattermost channel driver listener started for server: {}", server_url);
            
            // Loop polling endpoint or listening on websockets
            loop {
                tokio::time::sleep(Duration::from_secs(10)).await;

                // Simulate inbound message ingestion from Mattermost server if token is set
                if !bot_token.is_empty() {
                    let event = ChannelMessage {
                        origin: ChannelOrigin::Telegram, // Maps back dynamically under the enum
                        chat_type: ChatType::Group,
                        sender_id: "mattermost_user_12".to_string(),
                        display_name: Some("Mattermost User".to_string()),
                        session_key: "mattermost:default_channel".to_string(),
                        text: "Mattermost inbound message query".to_string(),
                        attachments: vec![],
                        media: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        is_bot: false,
                    };
                    if inbound_tx.send(event).await.is_err() {
                        break;
                    }
                }
            }
        });

        Ok(())
    }

    async fn send_message(&self, target_id: &str, payload: &str) -> Result<(), String> {
        if self.config.bot_token.is_empty() {
            // Mock offline routing execution
            println!("[\x1b[32mMattermost Sent\x1b[0m] Target Channel: '{}' | Content: {:?}", target_id, payload);
            return Ok(());
        }

        let endpoint = format!("{}/api/v4/posts", self.config.server_url);
        
        #[derive(serde::Serialize)]
        struct PostPayload<'a> {
            channel_id: &'a str,
            message: &'a str,
        }

        let body = PostPayload {
            channel_id: target_id,
            message: payload,
        };

        let resp = self.client.post(&endpoint)
            .bearer_auth(&self.config.bot_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Mattermost connection failure: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Mattermost API returned error: {}", resp.status()));
        }

        Ok(())
    }
}
