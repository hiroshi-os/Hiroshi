use async_trait::async_trait;
use reqwest::Client;
use std::time::Duration;
use crate::channel::ChannelMessage;
use crate::config::TeamsConfig;
use crate::gateway::traits::ChannelDriver;

pub struct TeamsDriver {
    config: TeamsConfig,
    client: Client,
}

impl TeamsDriver {
    pub fn new(config: TeamsConfig) -> Self {
        Self {
            config,
            client: Client::builder().timeout(Duration::from_secs(8)).build().unwrap(),
        }
    }
}

#[async_trait]
impl ChannelDriver for TeamsDriver {
    fn channel_id(&self) -> &'static str {
        "teams"
    }

    async fn run(&self, _inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        // Teams Workflows is an outbound-only webhook notification gateway under Power Automate.
        // Incoming messages are not polled.
        Ok(())
    }

    async fn send_message(&self, _target_id: &str, payload: &str) -> Result<(), String> {
        if self.config.workflow_url.is_empty() {
            // Mock offline routing execution
            println!("[\x1b[32mTeams Sent\x1b[0m] Adaptive Card Payload: {:?}", payload);
            return Ok(());
        }

        // Teams requires a strict AdaptiveCard JSON structure
        let card = serde_json::json!({
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": [
                            {
                                "type": "TextBlock",
                                "text": "Hiroshi OS Execution",
                                "weight": "Bolder",
                                "size": "Medium"
                            },
                            {
                                "type": "TextBlock",
                                "text": payload,
                                "wrap": true
                            }
                        ]
                    }
                }
            ]
        });

        let resp = self.client.post(&self.config.workflow_url)
            .json(&card)
            .send()
            .await
            .map_err(|e| format!("Teams Workflows connection failure: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Teams Workflows returned error: {}", resp.status()));
        }

        Ok(())
    }
}
