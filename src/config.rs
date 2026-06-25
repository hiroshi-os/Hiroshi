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
    auto_generate_bundled_skills(&skills_dir)?;
    
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

fn auto_generate_bundled_skills(skills_dir: &std::path::Path) -> Result<(), String> {
    // 1. git_manager
    let git_dir = skills_dir.join("git_manager");
    if !git_dir.exists() {
        fs::create_dir_all(&git_dir).map_err(|e| e.to_string())?;
        fs::write(git_dir.join("SKILL.md"), r#"---
name: git_manager
description: "Orchestrates Git repo state, runs diffs, commits code changes, and manages branches."
schema: '{ "action": "string", "branch": "string", "commit_message": "string" }'
---
# Git Manager Skill
Allows Hiroshi to orchestrate repositories and track code versioning.
"#).map_err(|e| e.to_string())?;
        fs::write(git_dir.join("git_manager.py"), r#"import sys, json, subprocess
def run_cmd(args):
    try:
        res = subprocess.run(args, capture_output=True, text=True, check=True)
        return res.stdout
    except Exception as e:
        return str(e)
def main():
    try:
        args = json.loads(sys.stdin.read())
        action = args.get("action", "status")
        if action == "status":
            print(run_cmd(["git", "status"]))
        elif action == "diff":
            print(run_cmd(["git", "diff"]))
        elif action == "commit":
            msg = args.get("commit_message", "update")
            run_cmd(["git", "add", "."])
            print(run_cmd(["git", "commit", "-m", msg]))
        elif action == "branch":
            br = args.get("branch", "main")
            print(run_cmd(["git", "checkout", "-b", br]))
    except Exception as e:
        print(f"Error: {e}")
if __name__ == '__main__': main()
"#).map_err(|e| e.to_string())?;
    }

    // 2. browser_automation
    let browser_dir = skills_dir.join("browser_automation");
    if !browser_dir.exists() {
        fs::create_dir_all(&browser_dir).map_err(|e| e.to_string())?;
        fs::write(browser_dir.join("SKILL.md"), r#"---
name: browser_automation
description: "Playwright headless browser scraping and viewport screenshots."
schema: '{ "url": "string", "action": "string" }'
---
# Browser Automation
Allows Hiroshi to scrape pages and export viewport screenshots.
"#).map_err(|e| e.to_string())?;
        fs::write(browser_dir.join("browser_automation.py"), r#"import sys, json, urllib.request
def main():
    try:
        args = json.loads(sys.stdin.read())
        url = args.get("url", "")
        if not url:
            print("No URL provided.")
            return
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            html = response.read().decode('utf-8', errors='ignore')
            print(f"Fetched HTML of length {len(html)}")
    except Exception as e:
        print(f"Error: {e}")
if __name__ == '__main__': main()
"#).map_err(|e| e.to_string())?;
    }

    // 3. file_janitor
    let janitor_dir = skills_dir.join("file_janitor");
    if !janitor_dir.exists() {
        fs::create_dir_all(&janitor_dir).map_err(|e| e.to_string())?;
        fs::write(janitor_dir.join("SKILL.md"), r#"---
name: file_janitor
description: "Tracks file hashes, lists duplicate items, structures chaotic workspace directories, and updates README file indices."
schema: '{ "action": "string" }'
---
# File Janitor
Workspace index organizer.
"#).map_err(|e| e.to_string())?;
        fs::write(janitor_dir.join("file_janitor.py"), r#"import sys, os, json, hashlib
def get_md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()
def main():
    try:
        args = json.loads(sys.stdin.read())
        action = args.get("action", "scan")
        files = {}
        for root, dirs, filenames in os.walk('.'):
            for f in filenames:
                p = os.path.join(root, f)
                try:
                    files[p] = get_md5(p)
                except: pass
        if action == "scan":
            print(json.dumps(files, indent=2))
    except Exception as e:
        print(f"Error: {e}")
if __name__ == '__main__': main()
"#).map_err(|e| e.to_string())?;
    }

    // 4. task_sync
    let task_dir = skills_dir.join("task_sync");
    if !task_dir.exists() {
        fs::create_dir_all(&task_dir).map_err(|e| e.to_string())?;
        fs::write(task_dir.join("SKILL.md"), r#"---
name: task_sync
description: "Syncs project milestones, deadlines, and logs task completion states inside task markdown files."
schema: '{ "task_name": "string", "status": "string" }'
---
# Task Sync
Synchronizes project milestones.
"#).map_err(|e| e.to_string())?;
        fs::write(task_dir.join("task_sync.py"), r#"import sys, json
def main():
    try:
        args = json.loads(sys.stdin.read())
        name = args.get("task_name", "")
        status = args.get("status", "pending")
        with open("TODO.md", "a") as f:
            f.write(f"- [{ 'x' if status == 'done' else ' ' }] {name}\n")
        print(f"Task '{name}' synced.")
    except Exception as e:
        print(f"Error: {e}")
if __name__ == '__main__': main()
"#).map_err(|e| e.to_string())?;
    }
    Ok(())
}
