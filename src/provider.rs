use crate::config::AppConfig;
use crate::db::ChatMessage;
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use tokio_util::codec::LinesCodec;
use tokio_util::io::StreamReader;

#[derive(Serialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct OllamaChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub stream: bool,
    pub options: OllamaOptions,
}

#[derive(Serialize)]
pub struct OllamaOptions {
    pub temperature: f32,
    pub num_ctx: usize,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct OllamaStreamChunk {
    pub message: ChunkMessage,
    pub done: bool,
}

#[derive(Deserialize)]
pub struct ChunkMessage {
    pub content: String,
}

#[derive(Serialize)]
struct OllamaEmbeddingRequest {
    model: String,
    prompt: String,
}

#[derive(Deserialize)]
struct OllamaEmbeddingResponse {
    embedding: Vec<f32>,
}

pub struct OllamaProvider {
    client: reqwest::Client,
    host: String,
    model: String,
    temperature: f32,
    context_window: usize,
    embedding_model: String,
}

impl OllamaProvider {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            client: reqwest::Client::new(),
            host: config.ollama.host.clone(),
            model: config.ollama.model.clone(),
            temperature: config.ollama.temperature,
            context_window: config.ollama.context_window,
            embedding_model: config.ollama.embedding_model.clone(),
        }
    }

    pub async fn get_embeddings(&self, prompt: &str) -> Result<Vec<f32>, String> {
        let request_body = OllamaEmbeddingRequest {
            model: self.embedding_model.clone(),
            prompt: prompt.to_string(),
        };

        let url = format!("{}/api/embeddings", self.host);

        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama embeddings API at '{}': {}", url, e))?;

        if !response.status().is_success() {
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama embeddings API returned error: {}", err_text));
        }

        let body = response.json::<OllamaEmbeddingResponse>().await
            .map_err(|e| format!("Failed to parse embeddings JSON: {}", e))?;

        Ok(body.embedding)
    }

    pub async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        let mut messages = Vec::new();

        // 1. Add system prompt
        messages.push(Message {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        });

        // 2. Add history
        for msg in history {
            messages.push(Message {
                role: msg.role,
                content: msg.content,
            });
        }

        let request_body = OllamaChatRequest {
            model: self.model.clone(),
            messages,
            stream: true,
            options: OllamaOptions {
                temperature: self.temperature,
                num_ctx: self.context_window,
            },
        };

        let url = format!("{}/api/chat", self.host);

        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama server at '{}': {}", url, e))?;

        if !response.status().is_success() {
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama server returned error: {}", err_text));
        }

        let byte_stream = response.bytes_stream().map(|item| {
            item.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });

        let reader = StreamReader::new(byte_stream);
        let lines_stream = codec_stream(reader);

        Ok(Box::pin(lines_stream))
    }
}

fn codec_stream<R>(reader: R) -> impl Stream<Item = Result<String, String>>
where
    R: tokio::io::AsyncRead + Send + Unpin + 'static,
{
    let framed = tokio_util::codec::FramedRead::new(reader, LinesCodec::new());
    framed.map(|res| match res {
        Ok(line) => {
            if line.trim().is_empty() {
                return Ok(String::new());
            }
            match serde_json::from_str::<OllamaStreamChunk>(&line) {
                Ok(chunk) => {
                    Ok(chunk.message.content)
                }
                Err(e) => Err(format!("Failed to parse line as JSON: {}. Line was: {}", e, line)),
            }
        }
        Err(e) => Err(format!("Error reading stream line: {}", e)),
    })
}
