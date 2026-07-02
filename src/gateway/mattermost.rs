use async_trait::async_trait;
use crate::channel::ChannelMessage;
use crate::config::MattermostConfig;
use crate::gateway::traits::ChannelDriver;

pub struct MattermostDriver {
    _config: MattermostConfig,
}

impl MattermostDriver {
    pub fn new(config: MattermostConfig) -> Self {
        Self { _config: config }
    }
}

#[async_trait]
impl ChannelDriver for MattermostDriver {
    fn channel_id(&self) -> &'static str {
        "mattermost"
    }

    async fn run(&self, _inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        // Minimal connection loop placeholder
        Ok(())
    }

    async fn send_message(&self, _target_id: &str, _payload: &str) -> Result<(), String> {
        // Dispatch messaging placeholder
        Ok(())
    }
}
