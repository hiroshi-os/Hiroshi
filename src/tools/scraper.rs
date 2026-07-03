use reqwest::Client;
use std::collections::HashMap;
use crate::config::ScraperConfig;
use regex::Regex;

pub async fn scrape_url(url: &str, config: &ScraperConfig) -> Result<String, String> {
    if !config.enabled {
        return Err("Web scraping is disabled in configurations.".to_string());
    }

    let client = Client::new();

    // 1. Try Firecrawl
    if let Some(ref api_key) = config.firecrawl_api_key {
        if !api_key.trim().is_empty() {
            let mut payload = HashMap::new();
            payload.insert("url", url.to_string());
            
            let resp = client.post("https://api.firecrawl.dev/v1/scrape")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&payload)
                .send()
                .await;
                
            if let Ok(r) = resp {
                if r.status().is_success() {
                    if let Ok(json) = r.json::<serde_json::Value>().await {
                        if let Some(markdown) = json["data"]["markdown"].as_str() {
                            return Ok(markdown.to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. Try Exa
    if let Some(ref api_key) = config.exa_api_key {
        if !api_key.trim().is_empty() {
            let mut payload = HashMap::new();
            payload.insert("url", url.to_string());
            
            let resp = client.post("https://api.exa.ai/contents")
                .header("x-api-key", api_key)
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await;
                
            if let Ok(r) = resp {
                if r.status().is_success() {
                    if let Ok(json) = r.json::<serde_json::Value>().await {
                        if let Some(text) = json["results"][0]["text"].as_str() {
                            return Ok(text.to_string());
                        }
                    }
                }
            }
        }
    }

    // 3. Fallback resilient custom crawler
    let resp = client.get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP status failure: {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Failed to read body: {}", e))?;
    let markdown = parse_html_to_markdown(&html);
    Ok(markdown)
}

fn parse_html_to_markdown(html: &str) -> String {
    // Strip script tags
    let re_script = Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    let cleaned = re_script.replace_all(html, "");

    // Strip style tags
    let re_style = Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    let cleaned = re_style.replace_all(&cleaned, "");

    // Format bold/strong first
    let re_bold = Regex::new(r"(?i)<(strong|b)\b[^>]*>(.*?)</\s*(strong|b)\b\s*>").unwrap();
    let cleaned = re_bold.replace_all(&cleaned, "**$2**");

    // Extract headers (h1-h6) and format them as markdown headers
    let re_header = Regex::new(r"(?i)<h([1-6])\b[^>]*>(.*?)</h[1-6]>").unwrap();
    let cleaned = re_header.replace_all(&cleaned, |caps: &regex::Captures| {
        let level = caps[1].parse::<usize>().unwrap_or(1);
        let header_text = &caps[2];
        format!("\n{} {}\n", "#".repeat(level), header_text.trim())
    });

    // Format paragraphs
    let re_p = Regex::new(r"(?i)<p\b[^>]*>(.*?)</p>").unwrap();
    let cleaned = re_p.replace_all(&cleaned, "\n$1\n");

    // Clean remaining tags
    let text = strip_html_tags(&cleaned);

    // Compress blank lines
    let mut compressed = String::new();
    let mut prev_is_empty = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !prev_is_empty {
                compressed.push_str("\n");
                prev_is_empty = true;
            }
        } else {
            compressed.push_str(trimmed);
            compressed.push_str("\n");
            prev_is_empty = false;
        }
    }

    compressed.trim().to_string()
}

fn strip_html_tags(html: &str) -> String {
    let re_tags = Regex::new(r"<[^>]*>").unwrap();
    let decoded = re_tags.replace_all(html, "");
    
    // Quick html entity decode
    decoded
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_html_to_markdown() {
        let html = "<html><head><style>body { color: red; }</style></head><body><h1>Main Title</h1><p>This is a <strong>bold</strong> paragraph.</p><script>console.log('hello');</script></body></html>";
        let md = parse_html_to_markdown(html);
        assert!(md.contains("# Main Title"));
        assert!(md.contains("This is a **bold** paragraph."));
        assert!(!md.contains("console.log"));
        assert!(!md.contains("color: red"));
    }

    #[tokio::test]
    async fn test_scrape_disabled() {
        let config = ScraperConfig {
            enabled: false,
            firecrawl_api_key: None,
            exa_api_key: None,
        };
        let res = scrape_url("http://example.com", &config).await;
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "Web scraping is disabled in configurations.");
    }
}
