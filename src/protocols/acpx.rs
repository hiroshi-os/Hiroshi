use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use regex::Regex;
use crate::config::AcpxHarnessConfig;

pub async fn spawn_headless_harness(
    agent_bin: &str,
    workspace_cwd: &str,
    prompt: &str,
    config: &AcpxHarnessConfig,
) -> Result<String, String> {
    if !config.allowed_harness_agents.contains(&agent_bin.to_string()) {
        return Err(format!("Agent binary '{}' is not in the allowed harness agents list.", agent_bin));
    }

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(&["/C", agent_bin]);
        c
    } else {
        Command::new(agent_bin)
    };

    let mut child = cmd
        .current_dir(workspace_cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sub-process: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut reader = BufReader::new(stdout).lines();

    // 1. Initialize Handshake
    let init_req = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2.0"
        },
        "id": 1
    });
    let _ = stdin.write_all(format!("{}\n", init_req.to_string()).as_bytes()).await;
    let _ = stdin.flush().await;

    // 2. session/new
    let session_req = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "session/new",
        "params": {
            "workspace": workspace_cwd
        },
        "id": 2
    });
    let _ = stdin.write_all(format!("{}\n", session_req.to_string()).as_bytes()).await;
    let _ = stdin.flush().await;

    // 3. session/prompt
    let prompt_req = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "session/prompt",
        "params": {
            "prompt": prompt
        },
        "id": 3
    });
    let _ = stdin.write_all(format!("{}\n", prompt_req.to_string()).as_bytes()).await;
    let _ = stdin.flush().await;

    let mut output_log = String::new();
    let timeout_duration = std::time::Duration::from_secs(config.execution_timeout_seconds);
    let start_time = std::time::Instant::now();

    loop {
        if start_time.elapsed() > timeout_duration {
            let _ = child.kill().await;
            return Err("Execution timed out".to_string());
        }

        tokio::select! {
            line_res = reader.next_line() => {
                match line_res {
                    Ok(Some(line)) => {
                        let clean_line = strip_ansi_codes(&line);
                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&clean_line) {
                            if let Some(method) = msg["method"].as_str() {
                                if method == "session/request_permission" {
                                    let id = msg["id"].clone();
                                    let approved = config.auto_approve_reads;
                                    let resp = serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "result": {
                                            "approved": approved
                                        },
                                        "id": id
                                    });
                                    let _ = stdin.write_all(format!("{}\n", resp.to_string()).as_bytes()).await;
                                    let _ = stdin.flush().await;
                                }
                            }
                            
                            if let Some(text) = msg["params"]["text"].as_str() {
                                output_log.push_str(text);
                            }
                            if let Some(result) = msg["result"].as_object() {
                                if let Some(text) = result.get("text").and_then(|t| t.as_str()) {
                                    output_log.push_str(text);
                                }
                            }
                        } else {
                            output_log.push_str(&clean_line);
                            output_log.push_str("\n");
                        }
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
            status = child.wait() => {
                if let Ok(s) = status {
                    tracing::debug!("Headless sub-process exited with status: {}", s);
                }
                break;
            }
        }
    }

    Ok(output_log.trim().to_string())
}

pub fn strip_ansi_codes(input: &str) -> String {
    let ansi_regex = Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    ansi_regex.replace_all(input, "").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_codes() {
        let raw = "\u{001b}[31mHello\u{001b}[0m World";
        assert_eq!(strip_ansi_codes(raw), "Hello World");
    }

    #[tokio::test]
    async fn test_spawn_headless_harness_unallowed() {
        let config = AcpxHarnessConfig {
            auto_approve_reads: true,
            allowed_harness_agents: vec!["allowed-agent".to_string()],
            execution_timeout_seconds: 10,
        };
        let res = spawn_headless_harness("unallowed-agent", ".", "run", &config).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("not in the allowed harness agents list"));
    }
}
