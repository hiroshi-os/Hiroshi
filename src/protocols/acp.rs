use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock, Arc};
use crate::db::MemoryEngine;
use crate::providers::ModelProvider;

static ACTIVE_BINDINGS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn get_bindings() -> &'static Mutex<HashMap<String, String>> {
    ACTIVE_BINDINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<serde_json::Value>,
    pub id: Option<serde_json::Value>,
}

pub fn handle_acp_bind(channel_session_key: &str, target_thread_id: &str) -> String {
    let mut guard = get_bindings().lock().unwrap();
    guard.insert(channel_session_key.to_string(), target_thread_id.to_string());
    format!(
        "[ACP BIND] Gateway session bound to background IDE thread context: '{}'",
        target_thread_id
    )
}

pub fn handle_cas_resume(channel_session_key: &str) -> String {
    let guard = get_bindings().lock().unwrap();
    match guard.get(channel_session_key) {
        Some(thread_id) => {
            format!("[ACP RESUME] Re-connected to active background thread session: '{}'", thread_id)
        }
        None => {
            "[ACP ERROR] No active thread session bindings found for this gateway channel. Trigger `/acp_bind <id>` first.".to_string()
        }
    }
}

pub fn parse_acp_message(payload: &str) -> Result<JsonRpcRequest, String> {
    serde_json::from_str(payload).map_err(|e| format!("Invalid JSON-RPC: {}", e))
}

pub fn format_acp_response(id: Option<serde_json::Value>, result: serde_json::Value) -> String {
    let resp = JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(result),
        error: None,
        id,
    };
    serde_json::to_string(&resp).unwrap_or_default()
}

pub async fn run_acp_stdio_loop(
    _db: Arc<MemoryEngine>,
    _provider: Arc<dyn ModelProvider>,
) -> Result<(), String> {
    use tokio::io::{self, AsyncBufReadExt, BufReader};
    
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    
    while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        if let Ok(req) = parse_acp_message(&line) {
            let res = match req.method.as_str() {
                "initialize" => {
                    serde_json::json!({
                        "protocolVersion": "2.0",
                        "capabilities": {
                            "session": true,
                            "prompt": true
                        }
                    })
                }
                "session/new" => {
                    serde_json::json!({
                        "sessionId": "acp-session-1"
                    })
                }
                "session/load" => {
                    serde_json::json!({
                        "sessionId": "acp-session-1",
                        "history": [
                            { "role": "user", "content": "Hello" },
                            { "role": "assistant", "content": "Hello, how can I assist you?" }
                        ]
                    })
                }
                "session/prompt" => {
                    serde_json::json!({
                        "text": "Hello! I am connected via the Agent Client Protocol."
                    })
                }
                _ => serde_json::json!({ "error": "Unknown method" }),
            };
            println!("{}", format_acp_response(req.id, res));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_acp_message_parsing() {
        let payload = r#"{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}"#;
        let parsed = parse_acp_message(payload).unwrap();
        assert_eq!(parsed.method, "initialize");
        assert_eq!(parsed.id.unwrap(), 1);
    }

    #[test]
    fn test_acp_bind_and_resume() {
        let channel_key = "telegram_12345";
        let thread_id = "workspace_active_thread_9";

        let bind_res = handle_acp_bind(channel_key, thread_id);
        assert!(bind_res.contains(thread_id));

        let resume_res = handle_cas_resume(channel_key);
        assert!(resume_res.contains(thread_id));
    }

    #[test]
    fn test_acp_resume_empty() {
        let resume_res = handle_cas_resume("non_existent_session");
        assert!(resume_res.contains("No active thread session bindings"));
    }
}
