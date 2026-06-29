use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct IncomingEvent {
    pub channel_type: String,
    pub session_id: String,
    pub text: String,
}

#[async_trait]
pub trait CommunicationChannel: Send + Sync {
    async fn listen(&self, tx: tokio::sync::mpsc::Sender<IncomingEvent>) -> Result<(), String>;
    async fn send_message(&self, target_id: &str, content: &str) -> Result<(), String>;
}
