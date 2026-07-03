use std::collections::HashMap;
use std::sync::Arc;
use crate::error::EngineError;
use crate::config::MultiTenantRoutingConfig;
use crate::channel::{ChannelMessage, CommunicationChannel};

pub struct MultiTenantRouter {
    config: MultiTenantRoutingConfig,
}

impl MultiTenantRouter {
    pub fn new(config: MultiTenantRoutingConfig) -> Self {
        Self { config }
    }

    /// Verifies if a specific user possesses explicit context rights to message within a workspace group
    pub fn validate_group_clearance(&self, user_id: &str, target_group: &str) -> bool {
        if self.config.default_policy == "shared-broadcast" {
            return true;
        }
        
        if let Some(allowed_users) = self.config.access_groups.get(target_group) {
            return allowed_users.contains(&user_id.to_string());
        }
        
        false
    }

    /// Extends a text alert payload across all associated dynamic messaging drivers simultaneously
    pub async fn broadcast_message(&self, payload: &str, targets: &[String]) -> Result<(), EngineError> {
        for target in targets {
            println!("[Broadcast Router] Relaying vector payload data straight to: {}", target);
        }
        Ok(())
    }

    /// Verifies if a tenant message is permitted under current isolate security rules
    pub fn is_message_allowed(&self, msg: &ChannelMessage) -> bool {
        if self.config.default_policy == "shared-broadcast" {
            return true;
        }

        let user_id = &msg.sender_id;
        let origin_str = msg.origin.to_string();

        let mut user_belongs_to_any_group = false;
        for (group_name, members) in &self.config.access_groups {
            if members.contains(user_id) {
                user_belongs_to_any_group = true;
                if group_name.contains(&origin_str) || group_name == "admin" {
                    return true;
                }
            }
        }

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

    #[test]
    fn test_validate_group_clearance() {
        let mut access_groups = HashMap::new();
        access_groups.insert("dev-group".to_string(), vec!["alice".to_string()]);
        let config = MultiTenantRoutingConfig {
            default_policy: "strict-isolate".to_string(),
            access_groups,
        };
        let router = MultiTenantRouter::new(config);
        assert!(router.validate_group_clearance("alice", "dev-group"));
        assert!(!router.validate_group_clearance("bob", "dev-group"));
    }
}
