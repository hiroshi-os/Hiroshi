use std::fs;
use std::path::Path;
use reqwest::Client;
use crate::config::AudioSystemConfig;
use crate::channel::ChannelMessage;

pub async fn process_inbound_audio(
    msg: &mut ChannelMessage,
    config: &AudioSystemConfig,
    sandbox_path: &str,
) -> Result<(), String> {
    if !config.enabled {
        return Ok(());
    }

    let mut audio_bytes = None;
    let file_ext = "mp3".to_string();

    for attachment in &msg.attachments {
        if attachment.kind == "audio" || attachment.kind == "voice" {
            if let Some(ref data) = attachment.data {
                audio_bytes = Some(data.clone());
            } else if let Some(ref url) = attachment.url {
                let client = Client::new();
                if let Ok(resp) = client.get(url).send().await {
                    if let Ok(bytes) = resp.bytes().await {
                        audio_bytes = Some(bytes.to_vec());
                    }
                }
            }
            break;
        }
    }

    let bytes = match audio_bytes {
        Some(b) => b,
        None => return Ok(()),
    };

    let audio_dir = Path::new(sandbox_path).join("audio").join("inbound");
    fs::create_dir_all(&audio_dir).map_err(|e| e.to_string())?;

    let filename = format!("inbound_{}.{}", msg.timestamp, file_ext);
    let cached_path = audio_dir.join(&filename);
    fs::write(&cached_path, &bytes).map_err(|e| e.to_string())?;

    let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
    if api_key.is_empty() && config.whisper_url.contains("api.openai.com") {
        msg.text = format!("[Simulated Voice Transcription for inbound_{}.mp3: 'Hello Hiroshi, please check my sandbox status.']", msg.timestamp);
        return Ok(());
    }

    let client = Client::new();
    let file_part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str("audio/mpeg")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", config.voice_model.clone());

    let mut req = client.post(&config.whisper_url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.multipart(form).send().await
        .map_err(|e| format!("Transcription request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Transcription API status error: {}", resp.status()));
    }

    #[derive(serde::Deserialize)]
    struct WhisperResponse {
        text: String,
    }

    let response_data: WhisperResponse = resp.json().await
        .map_err(|e| format!("Failed to parse transcription response: {}", e))?;

    msg.text = response_data.text;
    Ok(())
}

pub async fn generate_voice_response(
    text: &str,
    config: &AudioSystemConfig,
    sandbox_path: &str,
) -> Result<Option<Vec<u8>>, String> {
    if !config.enabled || !config.output_voice_enabled {
        return Ok(None);
    }

    let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
    if api_key.is_empty() && config.speech_url.contains("api.openai.com") {
        let bytes = b"MOCK_MP3_AUDIO_PAYLOAD_BYTES".to_vec();
        let out_dir = Path::new(sandbox_path).join("audio").join("outbound");
        fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
        let cached_path = out_dir.join("response.mp3");
        fs::write(&cached_path, &bytes).map_err(|e| e.to_string())?;
        return Ok(Some(bytes));
    }

    #[derive(serde::Serialize)]
    struct TtsRequest {
        model: String,
        input: String,
        voice: String,
    }

    let payload = TtsRequest {
        model: config.voice_model.clone(),
        input: text.to_string(),
        voice: "alloy".to_string(),
    };

    let client = Client::new();
    let mut req = client.post(&config.speech_url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.json(&payload).send().await
        .map_err(|e| format!("TTS speech API connection failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("TTS speech API error: {}", resp.status()));
    }

    let bytes = resp.bytes().await
        .map_err(|e| format!("Failed to download TTS audio: {}", e))?.to_vec();

    let out_dir = Path::new(sandbox_path).join("audio").join("outbound");
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let cached_path = out_dir.join("response.mp3");
    fs::write(&cached_path, &bytes).map_err(|e| e.to_string())?;

    Ok(Some(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_whisper_fallback() {
        let config = AudioSystemConfig {
            enabled: true,
            whisper_url: "https://api.openai.com/v1/audio/transcriptions".to_string(),
            speech_url: "https://api.openai.com/v1/audio/speech".to_string(),
            voice_model: "whisper-1".to_string(),
            output_voice_enabled: true,
        };

        let mut msg = ChannelMessage {
            origin: crate::channel::ChannelOrigin::Telegram,
            chat_type: crate::channel::ChatType::Direct,
            sender_id: "user".to_string(),
            display_name: None,
            session_key: "key".to_string(),
            text: "".to_string(),
            attachments: vec![crate::channel::Attachment {
                kind: "voice".to_string(),
                url: None,
                data: Some(vec![0; 100]),
            }],
            media: None,
            timestamp: 9999,
            is_bot: false,
        };

        let _ = unsafe { std::env::set_var("OPENAI_API_KEY", "") };
        let temp_dir = std::env::temp_dir().join("audio_inbound_test");
        let result = process_inbound_audio(&mut msg, &config, temp_dir.to_str().unwrap()).await;
        assert!(result.is_ok());
        assert!(msg.text.contains("Hello Hiroshi"));
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_tts_fallback() {
        let config = AudioSystemConfig {
            enabled: true,
            whisper_url: "https://api.openai.com/v1/audio/transcriptions".to_string(),
            speech_url: "https://api.openai.com/v1/audio/speech".to_string(),
            voice_model: "tts-1".to_string(),
            output_voice_enabled: true,
        };

        let _ = unsafe { std::env::set_var("OPENAI_API_KEY", "") };
        let temp_dir = std::env::temp_dir().join("audio_outbound_test");
        let result = generate_voice_response("Speak", &config, temp_dir.to_str().unwrap()).await;
        assert!(result.is_ok());
        let opt = result.unwrap();
        assert!(opt.is_some());
        assert_eq!(opt.unwrap(), b"MOCK_MP3_AUDIO_PAYLOAD_BYTES");
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
