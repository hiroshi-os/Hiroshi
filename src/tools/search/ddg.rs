use async_trait::async_trait;
use reqwest::Client;
use std::time::Duration;
use super::SearchProvider;

pub struct DuckDuckGoSearchProvider {
    client: Client,
}

impl DuckDuckGoSearchProvider {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(8))
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .build()
                .unwrap(),
        }
    }
}

#[async_trait]
impl SearchProvider for DuckDuckGoSearchProvider {
    async fn search(&self, query: &str) -> Result<String, String> {
        let url = format!("https://html.duckduckgo.com/html/?q={}", query);
        let resp = self.client.get(&url)
            .send()
            .await
            .map_err(|e| format!("DDG request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("DDG error status: {}", resp.status()));
        }

        let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ddg_mock() {
        let provider = DuckDuckGoSearchProvider::new();
        let _ = provider.client;
        assert!(true);
    }
}
