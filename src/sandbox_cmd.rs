use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

pub struct SafeCommandRunner {
    allowed_binaries: Vec<String>,
    workspace_path: std::path::PathBuf,
}

impl SafeCommandRunner {
    pub fn new(allowed_binaries: Vec<String>, workspace_path: std::path::PathBuf) -> Self {
        Self {
            allowed_binaries,
            workspace_path,
        }
    }

    pub fn validate_command(&self, cmd_line: &str) -> Result<(String, Vec<String>), String> {
        let trimmed = cmd_line.trim();
        if trimmed.is_empty() {
            return Err("Command cannot be empty".to_string());
        }

        // Scrub shell breakout characters
        let bad_chars = ['&', '|', ';', '$', '`', '\n', '\r'];
        if trimmed.chars().any(|c| bad_chars.contains(&c)) {
            return Err("Security Violation: Shell chain characters (&, |, ;, $, backticks, newlines) are strictly prohibited.".to_string());
        }

        // Tokenize command line
        let parts: Vec<String> = trimmed.split_whitespace().map(|s| s.to_string()).collect();
        if parts.is_empty() {
            return Err("Command cannot be empty after tokenization".to_string());
        }

        let binary = &parts[0];
        let bin_path = Path::new(binary);
        if bin_path.parent().is_some() && bin_path.parent() != Some(Path::new("")) {
            return Err("Security Violation: Only simple binary names are allowed; directory path injection blocked.".to_string());
        }

        if !self.allowed_binaries.contains(binary) {
            return Err(format!("Security Violation: Executable '{}' is not in the allowed binaries whitelist.", binary));
        }

        let args = parts[1..].to_vec();
        Ok((binary.clone(), args))
    }

    pub async fn run_command(&self, cmd_line: &str) -> Result<String, String> {
        let (binary, args) = self.validate_command(cmd_line)?;

        let mut child = Command::new(&binary)
            .args(&args)
            .current_dir(&self.workspace_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn process '{}': {}", binary, e))?;

        // 10 second timeout check
        let duration = Duration::from_secs(10);
        match timeout(duration, child.wait()).await {
            Ok(Ok(status)) => {
                let output = child.wait_with_output().await
                    .map_err(|e| format!("Failed to read process output: {}", e))?;
                
                let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
                
                if status.success() {
                    Ok(stdout_str)
                } else {
                    Err(format!("Process exited with status code: {}\nStdout: {}\nStderr: {}", status, stdout_str, stderr_str))
                }
            }
            Ok(Err(e)) => Err(format!("Process wait error: {}", e)),
            Err(_) => {
                let _ = child.kill().await;
                Err("Process Execution Timeout: Subprocess exceeded maximum 10-second run limit and was terminated.".to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_validation() {
        let runner = SafeCommandRunner::new(
            vec!["cargo".to_string(), "git".to_string()],
            std::path::PathBuf::from(r"C:\workspace"),
        );

        // Allowed
        assert!(runner.validate_command("cargo check").is_ok());
        assert!(runner.validate_command("git status -s").is_ok());

        // Not Allowed whitelist
        assert!(runner.validate_command("cat config.toml").is_err());

        // Injection checks
        assert!(runner.validate_command("cargo check && cat config.toml").is_err());
        assert!(runner.validate_command("git status ; cat config.toml").is_err());
        assert!(runner.validate_command(r"C:\Windows\System32\cmd.exe /c whoami").is_err());
    }
}
