use crate::error::EngineError;
use reqwest::Client;

pub async fn search_searxng(query: &str, base_url: &str) -> Result<String, EngineError> {
    let client = Client::new();
    let url = format!("{}/search?q={}&format=json", base_url.trim_end_matches('/'), urlencoding::encode(query));
    
    let response = client.get(&url).send().await
        .map_err(|e| EngineError::ToolError(format!("SearXNG dispatch failed: {}", e)))?;
        
    let json: serde_json::Value = response.json().await
        .map_err(|e| EngineError::ToolError(format!("SearXNG payload unreadable: {}", e)))?;
        
    let mut results = String::new();
    if let Some(results_array) = json.get("results").and_then(|r| r.as_array()) {
        for (i, item) in results_array.iter().take(5).enumerate() {
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled");
            let snippet = item.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let link = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
            results.push_str(&format!("{}. **{}** ({})\n   {}\n\n", i + 1, title, link, snippet));
        }
    }
    
    if results.is_empty() {
        return Err(EngineError::ToolError("SearXNG returned 0 relevant documents".to_string()));
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_searxng_fn() {
        // Just verify types match
        let _res = search_searxng("rust", "http://localhost:8080").await;
    }
}
