use crate::config::SecurityPairingConfig;
use crate::channel::ChannelMessage;
use crate::db::MemoryEngine;

pub fn validate_sender_access(
    msg: &ChannelMessage,
    config: &SecurityPairingConfig,
    db: &MemoryEngine,
) -> Result<bool, String> {
    if config.dm_policy != "pairing" {
        return Ok(true);
    }

    let channel_id = msg.origin.to_string();
    let sender_id = &msg.sender_id;

    if config.trusted_senders.contains(sender_id) {
        return Ok(true);
    }

    match db.is_sender_allowed(&channel_id, sender_id) {
        Ok(true) => return Ok(true),
        Ok(false) => {}
        Err(e) => return Err(e),
    }

    let pin = generate_pairing_pin();
    println!("\n[Pairing Security] Verification required for channel: '{}', sender: '{}'. PIN: '{}'. Run 'hiroshi pairing approve {} {}' to authorize.",
        channel_id, sender_id, pin, channel_id, sender_id
    );

    Ok(false)
}

fn generate_pairing_pin() -> String {
    use std::time::SystemTime;
    let chars = "ABCDEFGHJKLMNOPQRSTUVWXYZ23456789";
    let mut pin = String::new();
    let seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as usize;
    for i in 0..6 {
        let idx = (seed.wrapping_shr((i * 5) as u32)) % chars.len();
        if i == 3 {
            pin.push('-');
        }
        pin.push(chars.chars().nth(idx).unwrap_or('A'));
    }
    pin
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::channel::{ChannelOrigin, ChatType};
    use tempfile::tempdir;

    #[test]
    fn test_generate_pairing_pin() {
        let pin = generate_pairing_pin();
        assert_eq!(pin.len(), 7); // 6 characters + 1 hyphen
        assert!(pin.contains('-'));
    }

    #[tokio::test]
    async fn test_validate_sender_access_open() {
        let db_dir = tempdir().unwrap();
        let db_path = db_dir.path().join("test_sec.db");
        let db = MemoryEngine::new(&db_path).unwrap();

        let config = SecurityPairingConfig {
            dm_policy: "open".to_string(),
            trusted_senders: vec![],
        };

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

        let allowed = validate_sender_access(&msg, &config, &db).unwrap();
        assert!(allowed);
    }

    #[tokio::test]
    async fn test_validate_sender_access_trusted_config() {
        let db_dir = tempdir().unwrap();
        let db_path = db_dir.path().join("test_sec.db");
        let db = MemoryEngine::new(&db_path).unwrap();

        let config = SecurityPairingConfig {
            dm_policy: "pairing".to_string(),
            trusted_senders: vec!["friend".to_string()],
        };

        let msg = ChannelMessage {
            origin: ChannelOrigin::Telegram,
            chat_type: ChatType::Direct,
            sender_id: "friend".to_string(),
            display_name: None,
            session_key: "key".to_string(),
            text: "hello".to_string(),
            attachments: vec![],
            media: None,
            timestamp: 0,
            is_bot: false,
        };

        let allowed = validate_sender_access(&msg, &config, &db).unwrap();
        assert!(allowed);
    }

    #[tokio::test]
    async fn test_validate_sender_access_db_allowlist() {
        let db_dir = tempdir().unwrap();
        let db_path = db_dir.path().join("test_sec.db");
        let db = MemoryEngine::new(&db_path).unwrap();
        db.add_allowed_sender("telegram", "approved_user").unwrap();

        let config = SecurityPairingConfig {
            dm_policy: "pairing".to_string(),
            trusted_senders: vec![],
        };

        let msg = ChannelMessage {
            origin: ChannelOrigin::Telegram,
            chat_type: ChatType::Direct,
            sender_id: "approved_user".to_string(),
            display_name: None,
            session_key: "key".to_string(),
            text: "hello".to_string(),
            attachments: vec![],
            media: None,
            timestamp: 0,
            is_bot: false,
        };

        let allowed = validate_sender_access(&msg, &config, &db).unwrap();
        assert!(allowed);
    }

    #[tokio::test]
    async fn test_validate_sender_access_pairing_halt() {
        let db_dir = tempdir().unwrap();
        let db_path = db_dir.path().join("test_sec.db");
        let db = MemoryEngine::new(&db_path).unwrap();

        let config = SecurityPairingConfig {
            dm_policy: "pairing".to_string(),
            trusted_senders: vec![],
        };

        let msg = ChannelMessage {
            origin: ChannelOrigin::Telegram,
            chat_type: ChatType::Direct,
            sender_id: "unverified_user".to_string(),
            display_name: None,
            session_key: "key".to_string(),
            text: "hello".to_string(),
            attachments: vec![],
            media: None,
            timestamp: 0,
            is_bot: false,
        };

        let allowed = validate_sender_access(&msg, &config, &db).unwrap();
        assert!(!allowed);
    }
}
