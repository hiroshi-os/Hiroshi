use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub schema: String,
    pub executable_path: PathBuf,
}

pub struct SkillsRegistry {
    pub skills: Vec<Skill>,
}

impl SkillsRegistry {
    pub fn scan_dir(skills_dir: &Path) -> Result<Self, String> {
        let mut skills = Vec::new();
        if !skills_dir.exists() {
            return Ok(Self { skills });
        }

        let entries = fs::read_dir(skills_dir)
            .map_err(|e| format!("Failed to read skills directory: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    if let Ok(skill) = load_skill_from_folder(&path) {
                        skills.push(skill);
                    }
                }
            }
        }

        Ok(Self { skills })
    }

    pub fn get_skill(&self, name: &str) -> Option<&Skill> {
        self.skills.iter().find(|s| s.name == name)
    }
}

fn load_skill_from_folder(folder_path: &Path) -> Result<Skill, String> {
    let skill_md_path = folder_path.join("SKILL.md");
    if !skill_md_path.exists() {
        return Err("SKILL.md missing".to_string());
    }

    let md_content = fs::read_to_string(&skill_md_path)
        .map_err(|e| format!("Failed to read SKILL.md: {}", e))?;

    let mut name = String::new();
    let mut description = String::new();
    let mut schema = String::new();

    let lines: Vec<&str> = md_content.lines().collect();
    if lines.len() > 1 && lines[0].trim() == "---" {
        let in_fm = true;
        for line in &lines[1..] {
            let line_trimmed = line.trim();
            if line_trimmed == "---" {
                break;
            }
            if in_fm {
                if let Some(pos) = line_trimmed.find(':') {
                    let key = line_trimmed[..pos].trim();
                    let val = line_trimmed[pos + 1..].trim().trim_matches('"').trim_matches('\'');
                    match key {
                        "name" => name = val.to_string(),
                        "description" => description = val.to_string(),
                        "schema" => schema = val.to_string(),
                        _ => {}
                    }
                }
            }
        }
    }

    if name.is_empty() {
        name = folder_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
    }

    let mut executable_path = None;
    let entries = fs::read_dir(folder_path)
        .map_err(|e| format!("Failed to list folder: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if file_name != "SKILL.md" {
                    executable_path = Some(path);
                    break;
                }
            }
        }
    }

    let executable_path = executable_path
        .ok_or_else(|| format!("No executable script/binary found in skill folder '{}'", name))?;

    Ok(Skill {
        name,
        description,
        schema,
        executable_path,
    })
}

impl Skill {
    pub async fn run_ipc(&self, json_args: &str, workspace_path: &Path) -> Result<String, String> {
        let ext = self.executable_path.extension().and_then(|e| e.to_str()).unwrap_or("");

        let mut cmd = match ext {
            "py" => {
                let mut c = Command::new("python");
                c.arg(&self.executable_path);
                c
            }
            "sh" => {
                let mut c = Command::new("sh");
                c.arg(&self.executable_path);
                c
            }
            "bat" | "cmd" => {
                let mut c = Command::new("cmd");
                c.arg("/c").arg(&self.executable_path);
                c
            }
            "ps1" => {
                let mut c = Command::new("powershell");
                c.arg("-File").arg(&self.executable_path);
                c
            }
            _ => Command::new(&self.executable_path),
        };

        let mut child = cmd
            .current_dir(workspace_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to execute IPC skill process: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(json_args.as_bytes()).await
                .map_err(|e| format!("Failed to pipe JSON params to process stdin: {}", e))?;
            stdin.flush().await
                .map_err(|e| format!("Failed to flush process stdin: {}", e))?;
        }

        let duration = Duration::from_secs(10);
        match timeout(duration, child.wait()).await {
            Ok(Ok(status)) => {
                let output = child.wait_with_output().await
                    .map_err(|e| format!("Failed to read process output streams: {}", e))?;
                
                let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
                
                if status.success() {
                    Ok(stdout_str)
                } else {
                    Err(format!("Skill execution exited with error status: {}\nStdout: {}\nStderr: {}", status, stdout_str, stderr_str))
                }
            }
            Ok(Err(e)) => Err(format!("Process status check error: {}", e)),
            Err(_) => {
                let _ = child.kill().await;
                Err("Skill Execution Timeout: Subprocess exceeded maximum 10-second run limit and was terminated.".to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_skill_metadata_parsing() {
        let md = r#"---
name: calculate_sum
description: "Sums up two numeric parameters"
schema: '{ "a": "number", "b": "number" }'
---
# Calculate Sum Skill
Adds a and b.
"#;
        let dir = tempfile::tempdir().unwrap();
        let skill_dir = dir.path().join("calculate_sum");
        fs::create_dir_all(&skill_dir).unwrap();
        
        let md_file = skill_dir.join("SKILL.md");
        fs::File::create(&md_file).unwrap().write_all(md.as_bytes()).unwrap();

        let exe_file = skill_dir.join("calculate.py");
        fs::File::create(&exe_file).unwrap().write_all(b"print('hello')").unwrap();

        let registry = SkillsRegistry::scan_dir(dir.path()).unwrap();
        assert_eq!(registry.skills.len(), 1);

        let skill = registry.get_skill("calculate_sum").unwrap();
        assert_eq!(skill.description, "Sums up two numeric parameters");
        assert_eq!(skill.schema, "{ \"a\": \"number\", \"b\": \"number\" }");
        assert_eq!(skill.executable_path, exe_file);
    }
}
