use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

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
