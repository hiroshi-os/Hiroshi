use async_trait::async_trait;
use reqwest::Client;
use std::time::Duration;
use crate::channel::ChannelMessage;
use crate::config::SlackWebhookConfig;
use crate::gateway::traits::ChannelDriver;

pub struct SlackWebhookDriver {
    config: SlackWebhookConfig,
    client: Client,
}

impl SlackWebhookDriver {
    pub fn new(config: SlackWebhookConfig) -> Self {
        Self {
            config,
            client: Client::builder().timeout(Duration::from_secs(8)).build().unwrap(),
        }
    }
}

#[async_trait]
impl ChannelDriver for SlackWebhookDriver {
    fn channel_id(&self) -> &'static str {
        "slack_webhook"
    }

    async fn run(&self, _inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        // Slack webhooks are outbound-only notification pipelines.
        Ok(())
    }

    async fn send_message(&self, _target_id: &str, payload: &str) -> Result<(), String> {
        if self.config.webhook_url.is_empty() {
            // Mock offline routing execution
            println!("[\x1b[32mSlack Webhook Sent\x1b[0m] Payload: {:?}", payload);
            return Ok(());
        }

        let body = serde_json::json!({
            "text": payload
        });

        let resp = self.client.post(&self.config.webhook_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Slack Webhook connection failure: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Slack Webhook API returned error: {}", resp.status()));
        }

        Ok(())
    }
}
