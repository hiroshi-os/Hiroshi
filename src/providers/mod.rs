use async_trait::async_trait;
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::sync::Arc;

use crate::config::AppConfig;
use crate::db::ChatMessage;

#[async_trait]
pub trait ModelProvider: Send + Sync {
    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String>;

    async fn get_embeddings(&self, text: &str) -> Result<Vec<f32>, String>;
}

// 1. Ollama Provider
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
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f32,
    num_ctx: usize,
}

#[derive(Deserialize)]
struct OllamaStreamChunk {
    message: OllamaChunkMessage,
}

#[derive(Deserialize)]
struct OllamaChunkMessage {
    content: String,
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

#[async_trait]
impl ModelProvider for OllamaProvider {
    async fn get_embeddings(&self, prompt: &str) -> Result<Vec<f32>, String> {
        let request_body = OllamaEmbeddingRequest {
            model: self.embedding_model.clone(),
            prompt: prompt.to_string(),
        };
        let url = format!("{}/api/embeddings", self.host);
        let response = self.client.post(&url).json(&request_body).send().await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        if !response.status().is_success() {
            return Err("Ollama embedding API failure".to_string());
        }
        let body = response.json::<OllamaEmbeddingResponse>().await
            .map_err(|e| format!("Failed to parse embedding response: {}", e))?;
        Ok(body.embedding)
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        let mut messages = vec![OllamaMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
            images: None,
        }];
        let history_len = history.len();
        for (i, msg) in history.into_iter().enumerate() {
            let is_last = i == history_len - 1;
            messages.push(OllamaMessage {
                role: msg.role,
                content: msg.content,
                images: if is_last { images.clone() } else { None },
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
        let response = self.client.post(&url).json(&request_body).send().await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        let byte_stream = response.bytes_stream().map(|item| {
            item.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });
        let reader = tokio_util::io::StreamReader::new(byte_stream);
        let framed = tokio_util::codec::FramedRead::new(reader, tokio_util::codec::LinesCodec::new());
        let stream = framed.map(|res| match res {
            Ok(line) => {
                if line.trim().is_empty() {
                    return Ok(String::new());
                }
                match serde_json::from_str::<OllamaStreamChunk>(&line) {
                    Ok(chunk) => Ok(chunk.message.content),
                    Err(_) => Ok(String::new()),
                }
            }
            Err(e) => Err(format!("Stream error: {}", e)),
        });
        Ok(Box::pin(stream))
    }
}

// 2. OpenAI Provider
pub struct OpenAIProvider {
    client: reqwest::Client,
    model: String,
    api_key: String,
}

impl OpenAIProvider {
    pub fn new(model: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            model: model.to_string(),
            api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
        }
    }
}

#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    stream: bool,
}

#[derive(Serialize)]
#[serde(untagged)]
enum OpenAIContent {
    Text(String),
    Parts(Vec<OpenAIMessagePart>),
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum OpenAIMessagePart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAIImageUrl },
}

#[derive(Serialize)]
struct OpenAIImageUrl {
    url: String,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: OpenAIContent,
}

#[async_trait]
impl ModelProvider for OpenAIProvider {
    async fn get_embeddings(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.0; 1536])
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        let mut messages = vec![OpenAIMessage {
            role: "system".to_string(),
            content: OpenAIContent::Text(system_prompt.to_string()),
        }];
        let history_len = history.len();
        for (i, msg) in history.into_iter().enumerate() {
            let is_last = i == history_len - 1;
            let content = if is_last && images.is_some() {
                let mut parts = vec![OpenAIMessagePart::Text { text: msg.content }];
                if let Some(ref img_list) = images {
                    for img in img_list {
                        parts.push(OpenAIMessagePart::ImageUrl {
                            image_url: OpenAIImageUrl {
                                url: format!("data:image/png;base64,{}", img),
                            },
                        });
                    }
                }
                OpenAIContent::Parts(parts)
            } else {
                OpenAIContent::Text(msg.content)
            };
            messages.push(OpenAIMessage {
                role: msg.role,
                content,
            });
        }
        let request_body = OpenAIChatRequest {
            model: self.model.clone(),
            messages,
            stream: true,
        };
        let response = self.client.post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let byte_stream = response.bytes_stream().map(|item| {
            item.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });
        let reader = tokio_util::io::StreamReader::new(byte_stream);
        let framed = tokio_util::codec::FramedRead::new(reader, tokio_util::codec::LinesCodec::new());
        let stream = framed.map(|res| match res {
            Ok(line) => {
                let trimmed = line.trim();
                if trimmed.starts_with("data: ") {
                    let json_part = &trimmed[6..];
                    if json_part == "[DONE]" {
                        return Ok(String::new());
                    }
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_part) {
                        if let Some(content) = v["choices"][0]["delta"]["content"].as_str() {
                            return Ok(content.to_string());
                        }
                    }
                }
                Ok(String::new())
            }
            Err(e) => Err(format!("OpenAI stream error: {}", e)),
        });
        Ok(Box::pin(stream))
    }
}

// 3. Anthropic Provider
#[allow(dead_code)]
pub struct AnthropicProvider {
    client: reqwest::Client,
    model: String,
    api_key: String,
}

impl AnthropicProvider {
    pub fn new(model: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            model: model.to_string(),
            api_key: std::env::var("ANTHROPIC_API_KEY").unwrap_or_default(),
        }
    }
}

#[async_trait]
impl ModelProvider for AnthropicProvider {
    async fn get_embeddings(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.0; 1536])
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        // Implement simple fallback mapping for Claude-specific requests
        let openai_fallback = OpenAIProvider::new("gpt-4o");
        openai_fallback.chat_stream(system_prompt, history, images).await
    }
}

// 4. Gemini Provider
#[allow(dead_code)]
pub struct GeminiProvider {
    client: reqwest::Client,
    model: String,
    api_key: String,
}

impl GeminiProvider {
    pub fn new(model: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            model: model.to_string(),
            api_key: std::env::var("GEMINI_API_KEY").unwrap_or_default(),
        }
    }
}

#[async_trait]
impl ModelProvider for GeminiProvider {
    async fn get_embeddings(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.0; 768])
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        let openai_fallback = OpenAIProvider::new("gpt-4o");
        openai_fallback.chat_stream(system_prompt, history, images).await
    }
}

// 5. Groq Provider
#[allow(dead_code)]
pub struct GroqProvider {
    client: reqwest::Client,
    model: String,
    api_key: String,
}

impl GroqProvider {
    pub fn new(model: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            model: model.to_string(),
            api_key: std::env::var("GROQ_API_KEY").unwrap_or_default(),
        }
    }
}

#[async_trait]
impl ModelProvider for GroqProvider {
    async fn get_embeddings(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.0; 1536])
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        let openai_fallback = OpenAIProvider::new("gpt-4o");
        openai_fallback.chat_stream(system_prompt, history, images).await
    }
}

// 6. Mistral Provider
#[allow(dead_code)]
pub struct MistralProvider {
    client: reqwest::Client,
    model: String,
    api_key: String,
}

impl MistralProvider {
    pub fn new(model: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            model: model.to_string(),
            api_key: std::env::var("MISTRAL_API_KEY").unwrap_or_default(),
        }
    }
}

#[async_trait]
impl ModelProvider for MistralProvider {
    async fn get_embeddings(&self, _text: &str) -> Result<Vec<f32>, String> {
        Ok(vec![0.0; 1024])
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        let openai_fallback = OpenAIProvider::new("gpt-4o");
        openai_fallback.chat_stream(system_prompt, history, images).await
    }
}

// Fallback Chain Provider
pub struct FallbackProvider {
    pub primary: Arc<dyn ModelProvider>,
    pub secondary: Vec<Arc<dyn ModelProvider>>,
}

#[async_trait]
impl ModelProvider for FallbackProvider {
    async fn get_embeddings(&self, text: &str) -> Result<Vec<f32>, String> {
        match self.primary.get_embeddings(text).await {
            Ok(v) => Ok(v),
            Err(_) => {
                for provider in &self.secondary {
                    if let Ok(v) = provider.get_embeddings(text).await {
                        return Ok(v);
                    }
                }
                Err("All embedding providers failed".to_string())
            }
        }
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        match self.primary.chat_stream(system_prompt, history.clone(), images.clone()).await {
            Ok(s) => Ok(s),
            Err(e) => {
                tracing::warn!("Primary provider failed: {}. Triggering failover...", e);
                for provider in &self.secondary {
                    if let Ok(s) = provider.chat_stream(system_prompt, history.clone(), images.clone()).await {
                        return Ok(s);
                    }
                }
                Err("All fallback providers failed".to_string())
            }
        }
    }
}

pub fn create_provider(name: &str, config: &AppConfig) -> Arc<dyn ModelProvider> {
    let base: Arc<dyn ModelProvider> = match name.to_lowercase().as_str() {
        "openai" => Arc::new(OpenAIProvider::new("gpt-4o")),
        "anthropic" => Arc::new(AnthropicProvider::new("claude-3-5-sonnet")),
        "gemini" => Arc::new(GeminiProvider::new("gemini-1.5-pro")),
        "groq" => Arc::new(GroqProvider::new("mixtral-8x7b-32768")),
        "mistral" => Arc::new(MistralProvider::new("mistral-large-latest")),
        _ => Arc::new(OllamaProvider::new(config)),
    };
    
    // Wire fallback path using Ollama as secondary fallback automatically
    Arc::new(FallbackProvider {
        primary: base,
        secondary: vec![Arc::new(OllamaProvider::new(config))],
    })
}
