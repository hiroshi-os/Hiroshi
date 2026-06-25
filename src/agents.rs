use std::fs;
use std::path::Path;
use std::collections::HashMap;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Agent {
    pub name: String,
    pub prompt: String,
    pub allowed_tools: Vec<String>,
    pub hand_off: String,
}

#[derive(Debug, Clone)]
pub struct AgentRouter {
    pub agents: HashMap<String, Agent>,
    pub active_agent: String,
}

impl AgentRouter {
    pub fn load_from_file(path: &Path) -> Result<Self, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read AGENTS.md: {}", e))?;
            
        let mut agents = HashMap::new();
        let mut current_agent_name: Option<String> = None;
        let mut prompt = String::new();
        let mut allowed_tools = Vec::new();
        let mut hand_off = String::new();

        for line in content.lines() {
            let line_trimmed = line.trim();
            if line_trimmed.starts_with("## ") {
                // Save previous agent if exists
                if let Some(name) = current_agent_name.take() {
                    agents.insert(name.clone(), Agent {
                        name,
                        prompt: prompt.clone(),
                        allowed_tools: allowed_tools.clone(),
                        hand_off: hand_off.clone(),
                    });
                }
                
                // Start new agent
                let name = line_trimmed[3..].trim().to_string();
                current_agent_name = Some(name);
                prompt.clear();
                allowed_tools.clear();
                hand_off.clear();
            } else if current_agent_name.is_some() {
                if line_trimmed.starts_with("- Prompt:") {
                    if let Some(idx) = line_trimmed.find('"') {
                        if let Some(end_idx) = line_trimmed[idx+1..].rfind('"') {
                            prompt = line_trimmed[idx+1 .. idx+1+end_idx].to_string();
                        }
                    }
                } else if line_trimmed.starts_with("- Allowed Tools:") {
                    if let Some(start_idx) = line_trimmed.find('[') {
                        if let Some(end_idx) = line_trimmed.find(']') {
                            let tools_str = &line_trimmed[start_idx+1..end_idx];
                            allowed_tools = tools_str.split(',')
                                .map(|t| t.trim().to_string())
                                .filter(|t| !t.is_empty())
                                .collect();
                        }
                    }
                } else if line_trimmed.starts_with("- Hand-off:") {
                    if let Some(idx) = line_trimmed.find('"') {
                        if let Some(end_idx) = line_trimmed[idx+1..].rfind('"') {
                            hand_off = line_trimmed[idx+1 .. idx+1+end_idx].to_string();
                        }
                    }
                }
            }
        }

        // Save last agent
        if let Some(name) = current_agent_name {
            agents.insert(name.clone(), Agent {
                name,
                prompt,
                allowed_tools,
                hand_off,
            });
        }

        // Default active agent is usually Architect
        let active_agent = if agents.contains_key("Architect") {
            "Architect".to_string()
        } else if let Some(first_key) = agents.keys().next() {
            first_key.clone()
        } else {
            return Err("No agents defined in AGENTS.md".to_string());
        };

        Ok(Self { agents, active_agent })
    }

    pub fn get_active_agent(&self) -> Option<&Agent> {
        self.agents.get(&self.active_agent)
    }

    pub fn switch_agent(&mut self, name: &str) -> bool {
        if self.agents.contains_key(name) {
            self.active_agent = name.to_string();
            true
        } else {
            false
        }
    }

    pub fn detect_handoff(&self, text: &str) -> Option<String> {
        if let Some(start_idx) = text.find("[HANDOFF:") {
            let sub = &text[start_idx + 9..];
            if let Some(end_idx) = sub.find(']') {
                let name = sub[..end_idx].trim().to_string();
                if self.agents.contains_key(&name) {
                    return Some(name);
                }
            }
        }
        None
    }
}

use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub struct SessionRouter {
    agents_file: std::path::PathBuf,
    sessions: Arc<Mutex<HashMap<String, AgentRouter>>>,
}

impl SessionRouter {
    pub fn new(agents_file: std::path::PathBuf) -> Self {
        Self {
            agents_file,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_or_create(&self, session_id: &str) -> Result<AgentRouter, String> {
        let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(router) = map.get(session_id) {
            Ok(router.clone())
        } else {
            let router = AgentRouter::load_from_file(&self.agents_file)?;
            map.insert(session_id.to_string(), router.clone());
            Ok(router)
        }
    }

    pub fn update(&self, session_id: &str, router: AgentRouter) -> Result<(), String> {
        let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
        map.insert(session_id.to_string(), router);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_agents_markdown_parsing() {
        let markdown = r#"# Agent Registry

## Architect
- Prompt: "You are the Architect agent."
- Allowed Tools: [ReadFile, WriteFile]
- Hand-off: "Go to Developer."

## Developer
- Prompt: "You are the Developer agent."
- Allowed Tools: [WriteFile]
- Hand-off: "Go to Architect."
"#;
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("AGENTS.md");
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(markdown.as_bytes()).unwrap();

        let router = AgentRouter::load_from_file(&file_path).unwrap();
        assert_eq!(router.agents.len(), 2);
        
        let arch = router.agents.get("Architect").unwrap();
        assert_eq!(arch.prompt, "You are the Architect agent.");
        assert_eq!(arch.allowed_tools, vec!["ReadFile", "WriteFile"]);

        let dev = router.agents.get("Developer").unwrap();
        assert_eq!(dev.prompt, "You are the Developer agent.");
        assert_eq!(dev.allowed_tools, vec!["WriteFile"]);

        assert_eq!(router.active_agent, "Architect");

        assert_eq!(router.detect_handoff("Please write code [HANDOFF: Developer] now"), Some("Developer".to_string()));
    }
}
