use async_trait::async_trait;
use crate::channel::ChannelMessage;
use crate::config::TeamsConfig;
use crate::gateway::traits::ChannelDriver;

pub struct TeamsDriver {
    _config: TeamsConfig,
}

impl TeamsDriver {
    pub fn new(config: TeamsConfig) -> Self {
        Self { _config: config }
    }
}

#[async_trait]
impl ChannelDriver for TeamsDriver {
    fn channel_id(&self) -> &'static str {
        "teams"
    }

    async fn run(&self, _inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        Ok(())
    }

    async fn send_message(&self, _target_id: &str, _payload: &str) -> Result<(), String> {
        Ok(())
    }
}
