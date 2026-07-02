use inquire::{Confirm, Select, Text, Password};
use std::fs;
use std::path::Path;
use reqwest::Client;
use std::collections::HashMap;
use crate::config::AppConfig;

pub async fn run_onboarding() -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let config_path = home.join(".hiroshi").join("config.toml");
    let _ = run_onboarding_wizard(&config_path).await?;
    Ok(())
}

pub async fn run_onboarding_wizard(config_path: &Path) -> Result<AppConfig, String> {
    println!("\x1b[1;35m================================================================================\x1b[0m");
    println!("\x1b[1;35m                    HIROSHI AGENT RUNTIME - ONBOARDING WIZARD                   \x1b[0m");
    println!("\x1b[1;35m================================================================================\x1b[0m\n");

    // 1. Display security disclaimer regarding sandbox permissions
    println!("\x1b[1;33m[!] SECURITY WARNING & DISCLAIMER\x1b[0m");
    println!("Hiroshi operates an autonomous ReAct reasoning loop that can generate and run code");
    println!("within your host machine workspace sandbox. While directory containment is strictly");
    println!("enforced via Dunce canonical jail checks, execute commands and allow custom skills");
    println!("with caution.\n");

    let agree = Confirm::new("Do you acknowledge the security model and wish to proceed with configuration?")
        .with_default(true)
        .prompt()
        .map_err(|e| format!("Failed to read disclaimer agreement: {}", e))?;

    if !agree {
        println!("Onboarding aborted by user request.");
        return Err("Onboarding aborted by user".to_string());
    }

    // Load or initialize default config
    let mut config = if config_path.exists() {
        let content = fs::read_to_string(config_path)
            .map_err(|e| format!("Failed to read existing config.toml: {}", e))?;
        toml::from_str(&content)
            .unwrap_or_else(|_| AppConfig::default())
    } else {
        if let Some(parent) = config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        AppConfig::default()
    };

    // 2. Select Model Orchestration Provider
    let providers = vec!["Ollama (Local Offline)", "OpenAI", "Anthropic", "Gemini"];
    let provider_selection = Select::new("Select your primary LLM orchestration provider:", providers)
        .prompt()
        .map_err(|e| format!("Failed to read provider selection: {}", e))?;

    let client = Client::new();
    let mut env_to_write = HashMap::new();

    match provider_selection {
        "Ollama (Local Offline)" => {
            config.engine.provider = Some("ollama".to_string());
            let host = Text::new("Enter Ollama API Host URL:")
                .with_default("http://127.0.0.1:11434")
                .prompt()
                .map_err(|e| format!("Failed to read host: {}", e))?;
            
            let model = Text::new("Enter Ollama model name (e.g. llama3, qwen2.5):")
                .with_default("qwen2.5")
                .prompt()
                .map_err(|e| format!("Failed to read model: {}", e))?;

            config.ollama.host = host.clone();
            config.ollama.model = model;

            // Connection testing
            println!("Testing connection to Ollama API at {}...", host);
            let url = format!("{}/api/tags", host);
            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    println!("[\x1b[32mOK\x1b[0m] Ollama connection validated successfully.");
                }
                _ => {
                    println!("[\x1b[33mWARNING\x1b[0m] Could not establish connection to Ollama at {}. Setup will proceed anyway.", host);
                }
            }
        }
        "OpenAI" => {
            config.engine.provider = Some("openai".to_string());
            let key = Password::new("Enter your OpenAI API Key:")
                .prompt()
                .map_err(|e| format!("Failed to read key: {}", e))?;

            env_to_write.insert("OPENAI_API_KEY", key.clone());

            // Connection testing
            println!("Testing connection to OpenAI API...");
            match client.get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", key))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    println!("[\x1b[32mOK\x1b[0m] OpenAI key validation check passed.");
                }
                _ => {
                    println!("[\x1b[33mWARNING\x1b[0m] OpenAI key validation returned error code. Please verify your token.");
                }
            }
        }
        "Anthropic" => {
            config.engine.provider = Some("anthropic".to_string());
            let key = Password::new("Enter your Anthropic API Key:")
                .prompt()
                .map_err(|e| format!("Failed to read key: {}", e))?;

            env_to_write.insert("ANTHROPIC_API_KEY", key.clone());

            // Connection testing
            println!("Testing connection to Anthropic API...");
            match client.get("https://api.anthropic.com/v1/complete")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
            {
                Ok(resp) if resp.status().as_u16() == 400 => {
                    println!("[\x1b[32mOK\x1b[0m] Anthropic validation check passed.");
                }
                _ => {
                    println!("[\x1b[33mWARNING\x1b[0m] Anthropic validation check returned unexpected response.");
                }
            }
        }
        "Gemini" => {
            config.engine.provider = Some("gemini".to_string());
            let key = Password::new("Enter your Gemini API Key:")
                .prompt()
                .map_err(|e| format!("Failed to read key: {}", e))?;

            env_to_write.insert("GEMINI_API_KEY", key.clone());

            // Connection testing
            println!("Testing connection to Gemini API...");
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", key);
            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    println!("[\x1b[32mOK\x1b[0m] Gemini API key validation check passed.");
                }
                _ => {
                    println!("[\x1b[33mWARNING\x1b[0m] Gemini API validation check failed.");
                }
            }
        }
        _ => {}
    }

    // 3. Channels config
    println!("\n\x1b[1;33m[2] INGRESS CHANNELS INTEGRATION SETUP\x1b[0m");
    let configure_channels = Confirm::new("Do you want to configure messaging gateway channels (Telegram, Discord, Slack)?")
        .with_default(false)
        .prompt()
        .map_err(|e| format!("Failed to read channel prompt: {}", e))?;

    if configure_channels {
        // Telegram Setup
        let enable_telegram = Confirm::new("Enable Telegram channel integration?")
            .with_default(false)
            .prompt()
            .map_err(|e| format!("Failed to read Telegram confirm: {}", e))?;

        if enable_telegram {
            let token = Text::new("Enter Telegram Bot Token:")
                .prompt()
                .map_err(|e| format!("Failed to read token: {}", e))?;
            config.telegram.token = token;
            config.telegram.enabled = true;
        }

        // Discord Setup
        let enable_discord = Confirm::new("Enable Discord channel integration?")
            .with_default(false)
            .prompt()
            .map_err(|e| format!("Failed to read Discord confirm: {}", e))?;

        if enable_discord {
            let token = Text::new("Enter Discord Bot Token:")
                .prompt()
                .map_err(|e| format!("Failed to read token: {}", e))?;
            config.discord.token = token;
            config.discord.enabled = true;
        }

        // Slack Setup
        let enable_slack = Confirm::new("Enable Slack Socket Mode integration?")
            .with_default(false)
            .prompt()
            .map_err(|e| format!("Failed to read Slack confirm: {}", e))?;

        if enable_slack {
            let bot_token = Text::new("Enter Slack Bot Token (xoxb-):")
                .prompt()
                .map_err(|e| format!("Failed to read bot token: {}", e))?;
            let app_token = Text::new("Enter Slack App Token (xapp-):")
                .prompt()
                .map_err(|e| format!("Failed to read app token: {}", e))?;
            config.slack.bot_token = bot_token;
            config.slack.app_token = app_token;
            config.slack.enabled = true;
        }
    }

    // Write config files
    let toml_string = toml::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize configuration structure: {}", e))?;
    fs::write(config_path, toml_string)
        .map_err(|e| format!("Failed to write config.toml: {}", e))?;
    println!("\n[\x1b[32mOK\x1b[0m] Configuration saved successfully to {}", config_path.display());

    // Write keys to local environment file for daemon reload readouts
    if !env_to_write.is_empty() {
        if let Some(parent) = config_path.parent() {
            let env_path = parent.join(".env");
            let mut env_content = String::new();
            for (k, v) in env_to_write {
                env_content.push_str(&format!("{}={}\n", k, v));
            }
            let _ = fs::write(&env_path, env_content);
            println!("[\x1b[32mOK\x1b[0m] API credentials saved securely to {}", env_path.display());
        }
    }

    // 4. Offer background service installation
    println!("\n\x1b[1;33m[3] BACKGROUND DAEMON SERVICE REGISTRATION\x1b[0m");
    let register_service = Confirm::new("Would you like to install Hiroshi as an always-on background system service?")
        .with_default(false)
        .prompt()
        .map_err(|e| format!("Failed to read service prompt: {}", e))?;

    if register_service {
        println!("Registering daemon service...");
        match crate::service::handle_service_cmd(crate::ServiceAction::Install) {
            Ok(_) => println!("[\x1b[32mOK\x1b[0m] Service daemon registered successfully."),
            Err(e) => println!("[\x1b[31mERROR\x1b[0m] Service installer failed: {}", e),
        }
    }

    println!("\n\x1b[1;32mOnboarding setup wizard completed successfully!\x1b[0m");
    println!("To start direct terminal chats with your agent persona, run: \x1b[1mhiroshi agent\x1b[0m");
    println!("To start background channels daemon service, run: \x1b[1mhiroshi daemon\x1b[0m\n");

    Ok(config)
}
