use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;

pub mod searxng;
pub mod ddg;

pub use searxng::search_searxng;
pub use ddg::DuckDuckGoSearchProvider;

#[async_trait]
pub trait SearchProvider: Send + Sync {
    async fn search(&self, query: &str) -> Result<String, String>;
}

// 1. Brave Search Adapter
pub struct BraveSearchProvider {
    client: Client,
    api_key: String,
}

impl BraveSearchProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder().timeout(Duration::from_secs(8)).build().unwrap(),
            api_key: api_key.to_string(),
        }
    }
}

#[async_trait]
impl SearchProvider for BraveSearchProvider {
    async fn search(&self, query: &str) -> Result<String, String> {
        if self.api_key.is_empty() {
            return Err("Brave API key is empty".to_string());
        }
        let url = format!("https://api.search.brave.com/res/v1/web/search?q={}", query);
        let resp = self.client.get(&url)
            .header("X-Subscription-Token", &self.api_key)
            .send()
            .await
            .map_err(|e| format!("Brave HTTP error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Brave API error status: {}", resp.status()));
        }

        let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(body)
    }
}

// 2. Tavily Search Adapter
pub struct TavilySearchProvider {
    client: Client,
    api_key: String,
}

impl TavilySearchProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder().timeout(Duration::from_secs(8)).build().unwrap(),
            api_key: api_key.to_string(),
        }
    }
}

#[derive(Serialize)]
struct TavilyRequest<'a> {
    api_key: &'a str,
    query: &'a str,
}

#[async_trait]
impl SearchProvider for TavilySearchProvider {
    async fn search(&self, query: &str) -> Result<String, String> {
        if self.api_key.is_empty() {
            return Err("Tavily API key is empty".to_string());
        }
        let payload = TavilyRequest {
            api_key: &self.api_key,
            query,
        };

        let resp = self.client.post("https://api.tavily.com/search")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Tavily HTTP error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Tavily API error status: {}", resp.status()));
        }

        let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(body)
    }
}

// 3. Firecrawl Scrape/Search Adapter
pub struct FirecrawlProvider {
    client: Client,
    api_key: String,
}

impl FirecrawlProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder().timeout(Duration::from_secs(10)).build().unwrap(),
            api_key: api_key.to_string(),
        }
    }
}

#[derive(Serialize)]
struct FirecrawlRequest<'a> {
    url: &'a str,
    #[serde(rename = "pageOptions")]
    page_options: HashMap<&'a str, &'a str>,
}

use std::collections::HashMap;

#[async_trait]
impl SearchProvider for FirecrawlProvider {
    async fn search(&self, query: &str) -> Result<String, String> {
        if self.api_key.is_empty() {
            return Err("Firecrawl API key is empty".to_string());
        }

        // Firecrawl expects a URL to scrape/crawl
        let target_url = if query.starts_with("http://") || query.starts_with("https://") {
            query
        } else {
            return Err("Firecrawl requires a valid target URL query starting with http:// or https://".to_string());
        };

        let mut page_options = HashMap::new();
        page_options.insert("onlyMainContent", "true");

        let payload = FirecrawlRequest {
            url: target_url,
            page_options,
        };

        let resp = self.client.post("https://api.firecrawl.dev/v1/scrape")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Firecrawl HTTP error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Firecrawl API error status: {}", resp.status()));
        }

        let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(body)
    }
}

// 4. Perplexity LLM Search Adapter
pub struct PerplexityProvider {
    client: Client,
    api_key: String,
}

impl PerplexityProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::builder().timeout(Duration::from_secs(12)).build().unwrap(),
            api_key: api_key.to_string(),
        }
    }
}

#[derive(Serialize)]
struct PerplexityMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct PerplexityRequest<'a> {
    model: &'a str,
    messages: Vec<PerplexityMessage<'a>>,
}

#[async_trait]
impl SearchProvider for PerplexityProvider {
    async fn search(&self, query: &str) -> Result<String, String> {
        if self.api_key.is_empty() {
            return Err("Perplexity API key is empty".to_string());
        }

        let payload = PerplexityRequest {
            model: "sonar",
            messages: vec![PerplexityMessage {
                role: "user",
                content: query,
            }],
        };

        let resp = self.client.post("https://api.perplexity.ai/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Perplexity HTTP error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Perplexity API error status: {}", resp.status()));
        }

        let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(body)
    }
}

// 5. Failover Search Cascade Manager
pub struct FailoverSearchProvider {
    pub primary: Arc<dyn SearchProvider>,
    pub secondary: Vec<Arc<dyn SearchProvider>>,
}

#[async_trait]
impl SearchProvider for FailoverSearchProvider {
    async fn search(&self, query: &str) -> Result<String, String> {
        match self.primary.search(query).await {
            Ok(res) => Ok(res),
            Err(e) => {
                tracing::warn!("Primary search provider failed: {}. Triggering failover swap...", e);
                for provider in &self.secondary {
                    if let Ok(res) = provider.search(query).await {
                        return Ok(res);
                    }
                }
                Err("All fallback search engines in cascade returned errors".to_string())
            }
        }
    }
}
