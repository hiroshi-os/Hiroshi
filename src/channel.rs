use async_trait::async_trait;
use serde::{Serialize, Deserialize};

/// Immutable platform origin identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChannelOrigin {
    Telegram,
    Discord,
    Slack,
    Terminal,
    Web,
    Unknown,
}

impl std::fmt::Display for ChannelOrigin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChannelOrigin::Telegram => write!(f, "telegram"),
            ChannelOrigin::Discord => write!(f, "discord"),
            ChannelOrigin::Slack => write!(f, "slack"),
            ChannelOrigin::Terminal => write!(f, "terminal"),
            ChannelOrigin::Web => write!(f, "web"),
            ChannelOrigin::Unknown => write!(f, "unknown"),
        }
    }
}

/// Chat context type — determines session scoping behavior.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatType {
    Direct,
    Group,
    Thread,
}

impl std::fmt::Display for ChatType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatType::Direct => write!(f, "direct"),
            ChatType::Group => write!(f, "group"),
            ChatType::Thread => write!(f, "thread"),
        }
    }
}

/// Structured media attachment descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    /// MIME-like type key (e.g. "image", "file", "audio").
    pub kind: String,
    /// Remote URL if the attachment is hosted externally.
    pub url: Option<String>,
    /// Raw binary data for inline attachments.
    #[serde(skip)]
    #[allow(dead_code)]
    pub data: Option<Vec<u8>>,
}

/// Immutable, platform-agnostic message envelope.
///
/// Every incoming communication from any channel connector is normalized
/// into this structure before entering the engine pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMessage {
    /// Platform the message originated from.
    pub origin: ChannelOrigin,
    /// Conversation context type.
    pub chat_type: ChatType,
    /// Immutable network identifier for the sender (not display name).
    pub sender_id: String,
    /// Optional human-readable display name (never used for auth).
    pub display_name: Option<String>,
    /// Compound session lookup key: `agent:channel:chat_type:peer_id`.
    pub session_key: String,
    /// The message text payload.
    pub text: String,
    /// Structured media attachments.
    pub attachments: Vec<Attachment>,
    /// Strongly-typed normalized media assets.
    #[serde(default)]
    pub media: Option<Vec<crate::gateway::media::MediaAsset>>,
    /// Unix epoch milliseconds.
    pub timestamp: i64,
    /// Whether this message was sent by a bot (blocks feedback loops).
    pub is_bot: bool,
}

impl ChannelMessage {
    /// Build the compound session key from components.
    #[allow(unused)]
    pub fn build_session_key(
        agent: &str,
        origin: &ChannelOrigin,
        chat_type: &ChatType,
        peer_id: &str,
    ) -> String {
        format!("{}:{}:{}:{}", agent, origin, chat_type, peer_id)
    }
}

#[async_trait]
pub trait CommunicationChannel: Send + Sync {
    /// Start listening for incoming messages on this channel.
    #[allow(dead_code)]
    async fn listen(&self, tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> Result<(), String>;
    /// Send an outbound message to a target on this channel.
    async fn send_message(&self, target_id: &str, content: &str) -> Result<(), String>;
}
