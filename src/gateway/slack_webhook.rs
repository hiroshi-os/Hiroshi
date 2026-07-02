use async_trait::async_trait;
use crate::channel::ChannelMessage;
use crate::config::SlackWebhookConfig;
use crate::gateway::traits::ChannelDriver;

pub struct SlackWebhookDriver {
    _config: SlackWebhookConfig,
}

impl SlackWebhookDriver {
    pub fn new(config: SlackWebhookConfig) -> Self {
        Self { _config: config }
    }
}

#[async_trait]
impl ChannelDriver for SlackWebhookDriver {
    fn channel_id(&self) -> &'static str {
        "slack_webhook"
    }

    async fn run(&self, _inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        Ok(())
    }

    async fn send_message(&self, _target_id: &str, _payload: &str) -> Result<(), String> {
        Ok(())
    }
}
