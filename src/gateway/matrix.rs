use async_trait::async_trait;
use crate::channel::ChannelMessage;
use crate::config::MatrixConfig;
use crate::gateway::traits::ChannelDriver;

pub struct MatrixDriver {
    _config: MatrixConfig,
}

impl MatrixDriver {
    pub fn new(config: MatrixConfig) -> Self {
        Self { _config: config }
    }
}

#[async_trait]
impl ChannelDriver for MatrixDriver {
    fn channel_id(&self) -> &'static str {
        "matrix"
    }

    async fn run(&self, _inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String> {
        Ok(())
    }

    async fn send_message(&self, _target_id: &str, _payload: &str) -> Result<(), String> {
        Ok(())
    }
}
