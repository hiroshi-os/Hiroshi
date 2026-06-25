use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EngineConfig {
    pub system_name: String,
    pub log_level: String,
}

fn default_embedding_model() -> String {
    "nomic-embed-text".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaConfig {
    pub host: String,
    pub model: String,
    pub temperature: f32,
    pub context_window: usize,
    #[serde(default = "default_embedding_model")]
    pub embedding_model: String,
}

fn default_allowed_binaries() -> Vec<String> {
    vec![
        "cargo".to_string(),
        "git".to_string(),
        "rustfmt".to_string(),
        "python".to_string(),
    ]
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecurityConfig {
    pub sandbox_path: String,
    pub allow_shell_commands: bool,
    #[serde(default = "default_allowed_binaries")]
    pub allowed_binaries: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TelegramConfig {
    pub token: String,
    pub allowed_user_ids: Vec<i64>,
    pub enabled: bool,
}

impl Default for TelegramConfig {
    fn default() -> Self {
        Self {
            token: "YOUR_TELEGRAM_BOT_TOKEN_HERE".to_string(),
            allowed_user_ids: vec![],
            enabled: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CronTask {
    pub name: String,
    pub schedule: String, // Cron format: "min hour day-of-month month day-of-week" or duration interval
    pub agent: String,
    pub prompt: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CronConfig {
    pub tasks: Vec<CronTask>,
}

impl Default for CronConfig {
    fn default() -> Self {
        Self {
            tasks: vec![
                CronTask {
                    name: "workspace_triage".to_string(),
                    schedule: "0 0 * * *".to_string(),
                    agent: "Architect".to_string(),
                    prompt: "Read all files inside the workspace and generate a README.md summary summarizing our active state.".to_string(),
                }
            ],
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub engine: EngineConfig,
    pub ollama: OllamaConfig,
    pub security: SecurityConfig,
    #[serde(default)]
    pub telegram: TelegramConfig,
    #[serde(default)]
    pub cron: CronConfig,
    #[serde(default)]
    pub mcp_servers: std::collections::HashMap<String, McpServerConfig>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            engine: EngineConfig {
                system_name: "Hiroshi".to_string(),
                log_level: "info".to_string(),
            },
            ollama: OllamaConfig {
                host: "http://127.0.0.1:11434".to_string(),
                model: "qwen2.5-coder:1.5b".to_string(),
                temperature: 0.2,
                context_window: 4096,
                embedding_model: default_embedding_model(),
            },
            security: SecurityConfig {
                sandbox_path: "~/.hiroshi/workspace".to_string(),
                allow_shell_commands: false,
                allowed_binaries: default_allowed_binaries(),
            },
            telegram: TelegramConfig::default(),
            cron: CronConfig::default(),
            mcp_servers: std::collections::HashMap::new(),
        }
    }
}

pub fn resolve_home_path(path: &str) -> PathBuf {
    if path.starts_with("~/") || path == "~" {
        if let Some(home) = dirs::home_dir() {
            let mut resolved = home;
            if path.len() > 2 {
                resolved.push(&path[2..]);
            }
            resolved
        } else {
            PathBuf::from(path)
        }
    } else {
        PathBuf::from(path)
    }
}

pub async fn init_hiroshi_dir() -> Result<(AppConfig, PathBuf, PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    let hiroshi_dir = home.join(".hiroshi");
    
    // Create base dir
    if !hiroshi_dir.exists() {
        fs::create_dir_all(&hiroshi_dir)
            .map_err(|e| format!("Failed to create ~/.hiroshi: {}", e))?;
    }
    
    // Create memory dir
    let memory_dir = hiroshi_dir.join("memory");
    if !memory_dir.exists() {
        fs::create_dir_all(&memory_dir)
            .map_err(|e| format!("Failed to create ~/.hiroshi/memory: {}", e))?;
    }

    // Create skills dir
    let skills_dir = hiroshi_dir.join("skills");
    if !skills_dir.exists() {
        fs::create_dir_all(&skills_dir)
            .map_err(|e| format!("Failed to create ~/.hiroshi/skills: {}", e))?;
    }
    
    // Check config.toml
    let config_path = hiroshi_dir.join("config.toml");
    let (config, needs_rewrite) = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config.toml: {}", e))?;
        let parsed: AppConfig = toml::from_str(&content)
            .map_err(|e| format!("Failed to parse config.toml: {}", e))?;
            
        let has_telegram = content.contains("[telegram]");
        let has_cron = content.contains("[cron]") || content.contains("[[cron.tasks]]");
        let has_allowed_binaries = content.contains("allowed_binaries");
        let has_embedding_model = content.contains("embedding_model");
        let has_mcp = content.contains("mcp_servers");
        
        (parsed, !has_telegram || !has_cron || !has_allowed_binaries || !has_embedding_model || !has_mcp)
    } else {
        let parsed = crate::onboard::run_onboarding_wizard(&config_path).await?;
        (parsed, false)
    };
    
    if needs_rewrite {
        let content = toml::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config.toml: {}", e))?;
        fs::write(&config_path, content)
            .map_err(|e| format!("Failed to write config.toml: {}", e))?;
    }
    
    // Create default AGENTS.md if missing
    let agents_path = hiroshi_dir.join("AGENTS.md");
    if !agents_path.exists() {
        let default_agents = r#"# Hiroshi Agents Directory

## Architect
- Prompt: "You are Hiroshi's Lead Architect. Deconstruct user tasks into discrete system designs."
- Allowed Tools: [ReadFile, WriteFile]
- Hand-off: "If execution code needs to be written, yield control to Developer using [HANDOFF: Developer]."

## Developer
- Prompt: "You are Hiroshi's Systems Programmer. Write clean, idiomatic Rust code."
- Allowed Tools: [WriteFile]
- Hand-off: "Yield back to Architect upon task completion using [HANDOFF: Architect]."
"#;
        fs::write(&agents_path, default_agents)
            .map_err(|e| format!("Failed to write default AGENTS.md: {}", e))?;
    }
    
    // Resolve database path
    let db_path = hiroshi_dir.join("hiroshi.db");
    
    // Resolve and create workspace path
    let workspace_path = resolve_home_path(&config.security.sandbox_path);
    if !workspace_path.exists() {
        fs::create_dir_all(&workspace_path)
            .map_err(|e| format!("Failed to create workspace directory: {}", e))?;
    }
    
    Ok((config, db_path, workspace_path, agents_path, memory_dir, skills_dir))
}
