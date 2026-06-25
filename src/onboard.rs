use std::fs;
use std::path::Path;
use inquire::{Text, Select, Confirm};
use serde_json::Value;
use crate::config::AppConfig;

pub async fn run_onboarding_wizard(config_path: &Path) -> Result<AppConfig, String> {
    println!("\n==================================================");
    println!("      Welcome to the Hiroshi Onboarding Setup      ");
    println!("==================================================\n");

    let system_name = Text::new("What is your AI Companion's Name?")
        .with_default("Hiroshi")
        .prompt()
        .map_err(|e| e.to_string())?;

    let host = "http://127.0.0.1:11434";
    let client = reqwest::Client::new();
    let mut model_options = vec![
        "qwen2.5-coder:1.5b".to_string(),
        "qwen2.5-coder:7b".to_string(),
        "llama3".to_string(),
        "custom".to_string(),
    ];

    println!("Scanning for local Ollama models...");
    if let Ok(resp) = client.get(&format!("{}/api/tags", host)).send().await {
        if let Ok(json) = resp.json::<Value>().await {
            if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
                let found: Vec<String> = models.iter()
                    .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                    .collect();
                if !found.is_empty() {
                    model_options = found;
                    model_options.push("custom".to_string());
                }
            }
        }
    }

    let model = Select::new("Choose an Ollama Model to pair with:", model_options)
        .prompt()
        .map_err(|e| e.to_string())?;

    let final_model = if model == "custom" {
        Text::new("Enter custom Ollama model name:")
            .prompt()
            .map_err(|e| e.to_string())?
    } else {
        model
    };

    let enable_tg = Confirm::new("Would you like to enable the Telegram Bot Gateway?")
        .with_default(false)
        .prompt()
        .map_err(|e| e.to_string())?;

    let mut tg_token = "YOUR_TELEGRAM_BOT_TOKEN_HERE".to_string();
    let mut tg_users = vec![];
    if enable_tg {
        tg_token = Text::new("Enter your Telegram Bot Token:")
            .prompt()
            .map_err(|e| e.to_string())?;
        
        let user_id_str = Text::new("Enter authorized Telegram User ID (numeric, comma-separated):")
            .prompt()
            .map_err(|e| e.to_string())?;
        
        tg_users = user_id_str.split(',')
            .filter_map(|s| s.trim().parse::<i64>().ok())
            .collect();
    }

    let mut config = AppConfig::default();
    config.engine.system_name = system_name;
    config.ollama.model = final_model;
    config.telegram.enabled = enable_tg;
    config.telegram.token = tg_token;
    config.telegram.allowed_user_ids = tg_users;

    let toml_str = toml::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config.toml: {}", e))?;
    fs::write(config_path, toml_str)
        .map_err(|e| format!("Failed to write config.toml: {}", e))?;

    println!("\nConfiguration successfully generated at {:?}", config_path);
    println!("Soul configuration pairs verified.\n");

    Ok(config)
}
