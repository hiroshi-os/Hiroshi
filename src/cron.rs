use crate::config::CronTask;
use crate::db::MemoryEngine;
use crate::provider::OllamaProvider;
use crate::sandbox::WorkspaceSandbox;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use chrono::{Local, Timelike, Datelike};

pub struct CronScheduler {
    tasks: Vec<CronTask>,
    db: Arc<MemoryEngine>,
    provider: Arc<OllamaProvider>,
    sandbox: Arc<WorkspaceSandbox>,
    memory_dir: PathBuf,
    ws_tx: tokio::sync::broadcast::Sender<String>,
}

impl CronScheduler {
    pub fn new(
        tasks: Vec<CronTask>,
        db: Arc<MemoryEngine>,
        provider: Arc<OllamaProvider>,
        sandbox: Arc<WorkspaceSandbox>,
        memory_dir: PathBuf,
        ws_tx: tokio::sync::broadcast::Sender<String>,
    ) -> Self {
        Self {
            tasks,
            db,
            provider,
            sandbox,
            memory_dir,
            ws_tx,
        }
    }

    pub fn start(self, shutdown_token: tokio_util::sync::CancellationToken) {
        let tasks = self.tasks;
        let db = self.db;
        let provider = self.provider;
        let sandbox = self.sandbox;
        let memory_dir = self.memory_dir;
        let ws_tx = self.ws_tx;

        tokio::spawn(async move {
            tracing::info!("Scheduler service started in the background.");
            loop {
                let now = Local::now();
                let sleep_secs = 60 - now.second();
                
                tokio::select! {
                    _ = shutdown_token.cancelled() => {
                        tracing::info!("Cron Scheduler shutting down...");
                        break;
                    }
                    _ = tokio::time::sleep(Duration::from_secs(sleep_secs as u64)) => {}
                }

                let check_time = Local::now();

                // Weekly DB Maintenance (Every Sunday at 3:00 AM)
                if check_time.weekday().num_days_from_sunday() == 0 && check_time.hour() == 3 && check_time.minute() == 0 {
                    let db_clone = db.clone();
                    let memory_dir_clone = memory_dir.clone();
                    tokio::spawn(async move {
                        tracing::info!("Running weekly database maintenance (vacuum & backup)...");
                        let backup_dir = memory_dir_clone.parent().map(|p| p.join("backups")).unwrap_or_else(|| memory_dir_clone.join("backups"));
                        if let Err(e) = db_clone.backup(&backup_dir) {
                            tracing::error!("Database backup failed: {}", e);
                        } else {
                            tracing::info!("Database backup saved successfully to {:?}", backup_dir);
                        }
                        if let Err(e) = db_clone.vacuum() {
                            tracing::error!("Database vacuum failed: {}", e);
                        } else {
                            tracing::info!("Database vacuum completed successfully.");
                        }
                    });
                }

                for task in &tasks {
                    if should_run_cron(&task.schedule, check_time) {
                        tracing::info!("Triggered background task: {}", task.name);
                        let task_clone = task.clone();
                        let task_name = task.name.clone();
                        let db_clone = db.clone();
                        let provider_clone = provider.clone();
                        let sandbox_clone = sandbox.clone();
                        let memory_dir_clone = memory_dir.clone();
                        let ws_tx_clone = ws_tx.clone();

                        tokio::spawn(async move {
                            if let Err(e) = execute_cron_task(
                                task_clone,
                                db_clone,
                                provider_clone,
                                sandbox_clone,
                                memory_dir_clone,
                                ws_tx_clone,
                            ).await {
                                tracing::error!("Failed to run task '{}': {}", task_name, e);
                            }
                        });
                    }
                }
            }
        });
    }
}

fn should_run_cron(schedule: &str, time: chrono::DateTime<Local>) -> bool {
    let parts: Vec<&str> = schedule.split_whitespace().collect();
    if parts.len() < 5 {
        return false;
    }

    let min_match = match_field(parts[0], time.minute());
    let hour_match = match_field(parts[1], time.hour());
    let dom_match = match_field(parts[2], time.day());
    let month_match = match_field(parts[3], time.month());
    let dow_match = parts[4] == "*" || match_field(parts[4], time.weekday().num_days_from_sunday());

    min_match && hour_match && dom_match && month_match && dow_match
}

fn match_field(field: &str, value: u32) -> bool {
    if field == "*" {
        return true;
    }
    if field.starts_with("*/") {
        if let Ok(step) = field[2..].parse::<u32>() {
            return value % step == 0;
        }
    }
    if let Ok(val) = field.parse::<u32>() {
        return val == value;
    }
    false
}

async fn execute_cron_task(
    task: CronTask,
    db: Arc<MemoryEngine>,
    provider: Arc<OllamaProvider>,
    sandbox: Arc<WorkspaceSandbox>,
    memory_dir: PathBuf,
    ws_tx: tokio::sync::broadcast::Sender<String>,
) -> Result<(), String> {
    // 1. Export daily log
    db.export_daily_log("terminal", &memory_dir)?;

    // 2. Perform memory compaction
    db.compact_memory("terminal", &memory_dir, &provider).await?;

    // Broadcast state_version event for hot-reload on dashboard
    let ws_msg = serde_json::json!({
        "type": "state_version",
        "changed_file": "MEMORY.md",
        "timestamp": chrono::Utc::now().timestamp_millis()
    });
    if let Ok(msg_str) = serde_json::to_string(&ws_msg) {
        let _ = ws_tx.send(msg_str);
    }

    // 3. Run LLM task prompt
    let system_prompt = format!(
        "You are {} running a scheduled task. You have access to the sandbox workspace.",
        task.agent
    );

    let mut stream = provider.chat_stream(&system_prompt, vec![crate::db::ChatMessage {
        role: "user".to_string(),
        content: task.prompt.clone(),
    }]).await?;

    use futures_util::StreamExt;
    let mut response = String::new();
    while let Some(chunk) = stream.next().await {
        if let Ok(text) = chunk {
            response.push_str(&text);
        }
    }

    if !response.trim().is_empty() {
        if response.contains("<write_file") {
            let calls = parse_cron_tool_calls(&response);
            for call in calls {
                let CronToolCall::WriteFile { path, content } = call;
                sandbox.write_file(&path, &content)?;
                tracing::info!("Wrote file '{}' to workspace for task '{}'.", path, task.name);
            }
        } else {
            sandbox.write_file("cron_output.txt", &response)?;
        }
    }

    Ok(())
}

enum CronToolCall {
    WriteFile { path: String, content: String },
}

fn parse_cron_tool_calls(content: &str) -> Vec<CronToolCall> {
    let mut calls = Vec::new();
    let mut last_idx = 0;
    while let Some(start) = content[last_idx..].find("<write_file") {
        let abs_start = last_idx + start;
        if let Some(end) = content[abs_start..].find("</write_file>") {
            let header_end = content[abs_start..].find(">").unwrap_or(0);
            let header = &content[abs_start..abs_start + header_end];
            let path = if let Some(p_start) = header.find("path=\"") {
                let p_sub = &header[p_start + 6..];
                if let Some(p_end) = p_sub.find("\"") {
                    p_sub[..p_end].to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let file_content = content[abs_start + header_end + 1..abs_start + end].to_string();
            if !path.is_empty() {
                calls.push(CronToolCall::WriteFile { path, content: file_content });
            }
            last_idx = abs_start + end + 13;
        } else {
            break;
        }
    }
    calls
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_cron_should_run() {
        let dt = Local.with_ymd_and_hms(2026, 6, 25, 0, 0, 0).unwrap();
        
        assert!(should_run_cron("0 0 * * *", dt));
        assert!(should_run_cron("* * * * *", dt));
        assert!(should_run_cron("*/5 * * * *", dt));
        
        let dt2 = Local.with_ymd_and_hms(2026, 6, 25, 12, 5, 0).unwrap();
        assert!(should_run_cron("*/5 * * * *", dt2));
        assert!(!should_run_cron("0 0 * * *", dt2));
    }
}
