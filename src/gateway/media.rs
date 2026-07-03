use std::fs;
use std::path::Path;
use crate::channel::ChannelMessage;
use crate::config::MediaConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct MediaAsset {
    pub id: String,
    pub mime_type: String,
    pub storage_pointer: String, // Points to local vault or Supabase storage paths
    pub byte_size: u64,
}

impl MediaAsset {
    pub fn new(id: &str, mime_type: &str, storage_pointer: &str, byte_size: u64) -> Self {
        Self {
            id: id.to_string(),
            mime_type: mime_type.to_string(),
            storage_pointer: storage_pointer.to_string(),
            byte_size,
        }
    }

    /// Degrades a media asset array into synthetic inline markdown description tags.
    /// Used as a fallback when submitting context history to text-only endpoints.
    pub fn degrade_assets(assets: &[Self]) -> String {
        if assets.is_empty() {
            return String::new();
        }

        let mut annotations = Vec::new();
        for asset in assets {
            let label = if asset.mime_type.starts_with("image/") {
                "IMAGE"
            } else if asset.mime_type.starts_with("audio/") {
                "AUDIO"
            } else if asset.mime_type.starts_with("video/") {
                "VIDEO"
            } else {
                "FILE"
            };
            annotations.push(format!(
                "[Attachment: {} (Mime: {}, Size: {} bytes, Path: {})]",
                label, asset.mime_type, asset.byte_size, asset.storage_pointer
            ));
        }

        format!("\n\n*System Annotation: Inbound media attachments degraded to text summaries:*\n{}", annotations.join("\n"))
    }
}

pub async fn process_inbound_message_media(
    msg: &mut ChannelMessage,
    config: &MediaConfig,
    sandbox_path: &str,
) -> Result<(), String> {
    if !config.enabled {
        return Ok(());
    }

    let mut media_assets = Vec::new();
    let media_dir = Path::new(sandbox_path).join("media");
    if let Err(e) = fs::create_dir_all(&media_dir) {
        return Err(format!("Failed to create media directory: {}", e));
    }

    for (idx, attachment) in msg.attachments.iter().enumerate() {
        if attachment.kind == "image" {
            let asset_id = format!("img_{}_{}", msg.timestamp, idx);
            let mut img_data = None;

            if let Some(ref data) = attachment.data {
                img_data = Some(data.clone());
            } else if let Some(ref url) = attachment.url {
                let client = reqwest::Client::new();
                if let Ok(resp) = client.get(url).send().await {
                    if let Ok(bytes) = resp.bytes().await {
                        if bytes.len() <= config.max_file_size_bytes {
                            img_data = Some(bytes.to_vec());
                        } else {
                            tracing::warn!("Attachment exceeds maximum file size check: {} bytes", bytes.len());
                        }
                    }
                }
            }

            if let Some(data) = img_data {
                let file_name = format!("{}.png", asset_id);
                let storage_path = media_dir.join(&file_name);
                if let Err(e) = fs::write(&storage_path, &data) {
                    return Err(format!("Failed to save media asset to disk: {}", e));
                }

                media_assets.push(MediaAsset {
                    id: asset_id,
                    mime_type: "image/png".to_string(),
                    storage_pointer: format!("media/{}", file_name),
                    byte_size: data.len() as u64,
                });
            }
        }
    }

    if !media_assets.is_empty() {
        msg.media = Some(media_assets);
    }

    Ok(())
}

pub fn encode_image_to_base64<P: AsRef<Path>>(path: P) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(base64::prelude::BASE64_STANDARD.encode(bytes))
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_degradation_fallback() {
        let assets = vec![
            MediaAsset::new("img1", "image/png", "/vault/img.png", 5048),
            MediaAsset::new("aud1", "audio/mp3", "/vault/audio.mp3", 102400),
            MediaAsset::new("doc1", "application/pdf", "/vault/doc.pdf", 89201),
        ];

        let summary = MediaAsset::degrade_assets(&assets);
        assert!(summary.contains("IMAGE"));
        assert!(summary.contains("AUDIO"));
        assert!(summary.contains("FILE"));
        assert!(summary.contains("/vault/img.png"));
        assert!(summary.contains("5048 bytes"));
    }

    #[test]
    fn test_media_degradation_empty() {
        let summary = MediaAsset::degrade_assets(&[]);
        assert_eq!(summary, "");
    }

    #[tokio::test]
    async fn test_process_inbound_message_media() {
        let config = MediaConfig {
            enabled: true,
            max_file_size_bytes: 1024 * 1024,
            allowed_mime_types: vec!["image/png".to_string()],
        };

        let temp_dir = std::env::temp_dir().join("hiroshi_media_test");
        let _ = fs::remove_dir_all(&temp_dir);

        let mut msg = ChannelMessage {
            origin: crate::channel::ChannelOrigin::Telegram,
            chat_type: crate::channel::ChatType::Direct,
            sender_id: "user123".to_string(),
            display_name: None,
            session_key: "telegram:user123".to_string(),
            text: "Here is a test image".to_string(),
            attachments: vec![crate::channel::Attachment {
                kind: "image".to_string(),
                url: None,
                data: Some(vec![1, 2, 3, 4, 5]),
            }],
            media: None,
            timestamp: 123456789,
            is_bot: false,
        };

        let result = process_inbound_message_media(&mut msg, &config, temp_dir.to_str().unwrap()).await;
        assert!(result.is_ok());
        assert!(msg.media.is_some());

        let media_list = msg.media.unwrap();
        assert_eq!(media_list.len(), 1);
        assert_eq!(media_list[0].byte_size, 5);
        assert!(media_list[0].storage_pointer.contains("img_123456789_0.png"));

        let full_path = temp_dir.join(&media_list[0].storage_pointer);
        let b64 = encode_image_to_base64(full_path);
        assert!(b64.is_ok());
        assert_eq!(b64.unwrap(), "AQIDBAU=");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
