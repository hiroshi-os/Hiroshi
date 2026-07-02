use std::collections::HashSet;
use crate::channel::ChannelMessage;

/// Immutable sender allowlist engine.
///
/// Evaluates incoming messages exclusively against immutable network
/// identifiers (`sender_id`) to prevent display-name forgery exploits.
/// An empty allowlist means open mode — all senders are permitted.
pub struct AllowlistEngine {
    allowed_ids: HashSet<String>,
}

impl AllowlistEngine {
    /// Create an allowlist from a list of permitted sender network IDs.
    /// If the list is empty, all senders are allowed (open mode).
    pub fn new(allowed_ids: Vec<String>) -> Self {
        Self {
            allowed_ids: allowed_ids.into_iter().collect(),
        }
    }

    /// Check whether a channel message's sender is permitted.
    ///
    /// Matching is performed exclusively on the `sender_id` field,
    /// never on `display_name`, to block display-name forgery attacks.
    pub fn is_allowed(&self, msg: &ChannelMessage) -> bool {
        // Block bot messages unconditionally
        if msg.is_bot {
            return false;
        }

        // Open mode: empty allowlist permits everyone
        if self.allowed_ids.is_empty() {
            return true;
        }

        self.allowed_ids.contains(&msg.sender_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::channel::{ChannelOrigin, ChatType};

    fn make_msg(sender_id: &str, is_bot: bool) -> ChannelMessage {
        ChannelMessage {
            origin: ChannelOrigin::Telegram,
            chat_type: ChatType::Direct,
            sender_id: sender_id.to_string(),
            display_name: Some("Display Name".to_string()),
            session_key: "test:key".to_string(),
            text: "hello".to_string(),
            attachments: vec![],
            media: None,
            timestamp: 0,
            is_bot,
        }
    }

    #[test]
    fn test_open_mode() {
        let engine = AllowlistEngine::new(vec![]);
        assert!(engine.is_allowed(&make_msg("anyone", false)));
    }

    #[test]
    fn test_allowed_sender() {
        let engine = AllowlistEngine::new(vec!["user123".to_string()]);
        assert!(engine.is_allowed(&make_msg("user123", false)));
    }

    #[test]
    fn test_blocked_sender() {
        let engine = AllowlistEngine::new(vec!["user123".to_string()]);
        assert!(!engine.is_allowed(&make_msg("intruder", false)));
    }

    #[test]
    fn test_bot_blocked_even_with_allowlist() {
        let engine = AllowlistEngine::new(vec!["bot-id".to_string()]);
        assert!(!engine.is_allowed(&make_msg("bot-id", true)));
    }

    #[test]
    fn test_bot_allowed_in_open_mode() {
        // Even in open mode, bots are blocked
        let engine = AllowlistEngine::new(vec![]);
        assert!(!engine.is_allowed(&make_msg("bot-id", true)));
    }
}
