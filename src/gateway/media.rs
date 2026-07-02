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
}
