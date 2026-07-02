use async_trait::async_trait;
use crate::channel::ChannelMessage;

#[async_trait]
pub trait ChannelDriver: Send + Sync {
    /// Returns the unique string identifier for the channel (e.g., "whatsapp", "mattermost")
    fn channel_id(&self) -> &'static str;

    /// Initiates the persistent network connection loop, feeding incoming traffic to the engine transmitter
    async fn run(&self, inbound_tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String>;

    /// Dispatches processed text back out to the target network socket
    async fn send_message(&self, target_id: &str, payload: &str) -> Result<(), String>;
}
