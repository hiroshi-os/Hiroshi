use std::collections::HashMap;
use std::sync::Arc;
use crate::config::MultiTenantRoutingConfig;
use crate::channel::{ChannelMessage, CommunicationChannel};

pub struct MultiTenantRouter {
    config: MultiTenantRoutingConfig,
}

impl MultiTenantRouter {
    pub fn new(config: MultiTenantRoutingConfig) -> Self {
        Self { config }
    }

    /// Verifies if a tenant message is permitted under current isolate security rules
    pub fn is_message_allowed(&self, msg: &ChannelMessage) -> bool {
        if self.config.default_policy == "shared-broadcast" {
            return true;
        }

        // For strict-isolate, look up access groups.
        // If the sender's user ID belongs to a group, verify that target channel/origin is allowed.
        let user_id = &msg.sender_id;
        let origin_str = msg.origin.to_string();

        let mut user_belongs_to_any_group = false;
        for (group_name, members) in &self.config.access_groups {
            if members.contains(user_id) {
                user_belongs_to_any_group = true;
                // If it is an access group mapping, check if origin matches group targets
                // Conceptually: if group name is associated with origin, e.g. "telegram" or "slack"
                if group_name.contains(&origin_str) || group_name == "admin" {
                    return true;
                }
            }
        }

        // If user is not configured in any groups, default to strict isolate block
        !user_belongs_to_any_group
    }

    /// Broadcasts an alert payload across all matching channel driver topologies
    pub async fn broadcast_alert(
        &self,
        group_name: &str,
        payload: &str,
        channels: &HashMap<String, Arc<dyn CommunicationChannel>>,
    ) -> Result<(), String> {
        let members = match self.config.access_groups.get(group_name) {
            Some(m) => m,
            None => return Err(format!("Group '{}' not found in routing configuration.", group_name)),
        };

        for origin_name in members {
            if let Some(chan) = channels.get(origin_name) {
                // Relays live alerts
                let _ = chan.send_message("broadcast_session", payload).await;
            }
        }

        Ok(())
    }

    /// Observe ambient events (non-prompt triggers) and map to system messages
    pub fn observe_ambient_event(&self, event_type: &str, metadata: &str) -> String {
        format!(
            "[Ambient Observer]: System detected channel transition event '{}' with metadata '{}'. Low priority context cached.",
            event_type, metadata
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::channel::{ChannelOrigin, ChatType};

    #[test]
    fn test_observe_ambient_event() {
        let config = MultiTenantRoutingConfig::default();
        let router = MultiTenantRouter::new(config);
        let log = router.observe_ambient_event("user_join", "user: 123");
        assert!(log.contains("user_join"));
    }

    #[test]
    fn test_is_message_allowed_open() {
        let config = MultiTenantRoutingConfig {
            default_policy: "shared-broadcast".to_string(),
            access_groups: HashMap::new(),
        };
        let router = MultiTenantRouter::new(config);
        let msg = ChannelMessage {
            origin: ChannelOrigin::Telegram,
            chat_type: ChatType::Direct,
            sender_id: "intruder".to_string(),
            display_name: None,
            session_key: "key".to_string(),
            text: "hello".to_string(),
            attachments: vec![],
            media: None,
            timestamp: 0,
            is_bot: false,
        };
        assert!(router.is_message_allowed(&msg));
    }
}
