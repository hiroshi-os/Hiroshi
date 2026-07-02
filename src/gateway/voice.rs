
use reqwest::Client;
use std::time::Duration;
use crate::gateway::media::MediaAsset;

// 1. Speech-to-Text Ingestion Pass
pub struct AudioTranscriptionEngine {
    client: Client,
    api_key: String,
}

impl AudioTranscriptionEngine {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder().timeout(Duration::from_secs(12)).build().unwrap(),
            api_key: api_key.to_string(),
        }
    }

    /// Transcribes the target voice note byte stream.
    /// If no API key is specified, falls back to a simulated transcript parser.
    pub async fn transcribe_media(&self, asset: &MediaAsset) -> Result<String, String> {
        if self.api_key.is_empty() {
            // Mock offline fallback transponder
            return Ok(format!(
                "[Simulated Voice Transcription for {}: 'Hello Hiroshi, please check my sandbox status.']",
                asset.id
            ));
        }

        // Real Whisper API call structure
        let form = reqwest::multipart::Form::new()
            .text("model", "whisper-1")
            .text("file", asset.storage_pointer.clone());

        let resp = self.client.post("https://api.openai.com/v1/audio/transcriptions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Whisper API connection error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Whisper API returned error: {}", resp.status()));
        }

        #[derive(serde::Deserialize)]
        struct WhisperResponse {
            text: String,
        }

        let result: WhisperResponse = resp.json().await
            .map_err(|e| format!("Failed to parse Whisper response: {}", e))?;

        Ok(result.text)
    }
}

// 2. Text-to-Speech Output Pipeline
pub struct VoiceSynthesisEngine {
    client: Client,
    api_key: String,
}

impl VoiceSynthesisEngine {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder().timeout(Duration::from_secs(10)).build().unwrap(),
            api_key: api_key.to_string(),
        }
    }

    /// Synthesizes speech from text and returns a vector of bytes representing the MP3 audio.
    pub async fn synthesize_speech(&self, text: &str) -> Result<Vec<u8>, String> {
        if self.api_key.is_empty() {
            // Mock offline fallback synthesizer
            return Ok(b"MOCK_MP3_AUDIO_PAYLOAD_BYTES".to_vec());
        }

        #[derive(serde::Serialize)]
        struct TtsRequest<'a> {
            model: &'a str,
            input: &'a str,
            voice: &'a str,
        }

        let payload = TtsRequest {
            model: "tts-1",
            input: text,
            voice: "alloy",
        };

        let resp = self.client.post("https://api.openai.com/v1/audio/speech")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("TTS connection error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("TTS returned error status: {}", resp.status()));
        }

        let bytes = resp.bytes().await
            .map_err(|e| format!("Failed to read TTS stream: {}", e))?;

        Ok(bytes.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_whisper_offline_fallback() {
        let engine = AudioTranscriptionEngine::new("");
        let asset = MediaAsset::new("voice1", "audio/mp3", "/vault/voice.mp3", 2400);
        let text = engine.transcribe_media(&asset).await.unwrap();
        assert!(text.contains("Hello Hiroshi"));
    }

    #[tokio::test]
    async fn test_tts_offline_fallback() {
        let engine = VoiceSynthesisEngine::new("");
        let bytes = engine.synthesize_speech("Test speech synthesis").await.unwrap();
        assert_eq!(bytes, b"MOCK_MP3_AUDIO_PAYLOAD_BYTES");
    }
}
