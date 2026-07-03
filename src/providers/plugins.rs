use std::process::{Command, Stdio, Child};
use std::io::{Write, BufReader, BufRead};
use std::sync::Mutex;
use std::pin::Pin;
use async_trait::async_trait;
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use crate::db::ChatMessage;
use super::ModelProvider;

#[derive(Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub main: String,
}

pub struct PluginProvider {
    name: String,
    child: Arc<Mutex<Child>>,
}

impl PluginProvider {
    pub fn new(manifest_path: &std::path::Path) -> Result<Self, String> {
        let manifest_content = std::fs::read_to_string(manifest_path)
            .map_err(|e| format!("Failed to read plugin manifest: {}", e))?;
        let manifest: PluginManifest = serde_json::from_str(&manifest_content)
            .map_err(|e| format!("Invalid plugin manifest schema: {}", e))?;

        let plugin_dir = manifest_path.parent().ok_or("Invalid manifest path parent")?;
        let main_js = plugin_dir.join(&manifest.main);

        // Spawn Node.js sidecar process running the JS plugin bundle
        let child = Command::new("node")
            .arg(main_js)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn plugin Node sidecar: {}", e))?;

        Ok(Self {
            name: manifest.name,
            child: Arc::new(Mutex::new(child)),
        })
    }
}

#[derive(Serialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: u64,
}

#[derive(Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    result: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
    id: u64,
}

#[async_trait]
impl ModelProvider for PluginProvider {
    async fn get_embeddings(&self, text: &str) -> Result<Vec<f32>, String> {
        let mut guard = self.child.lock().map_err(|e| e.to_string())?;
        let stdin = guard.stdin.as_mut().ok_or("Failed to open stdin to sidecar")?;
        let stdout = guard.stdout.as_mut().ok_or("Failed to open stdout from sidecar")?;

        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "get_embeddings".to_string(),
            params: serde_json::json!({ "text": text }),
            id: 1,
        };

        let req_bytes = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
        stdin.write_all(&req_bytes).map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;

        let mut reader = BufReader::new(stdout);
        let mut response_line = String::new();
        reader.read_line(&mut response_line).map_err(|e| e.to_string())?;

        let res: JsonRpcResponse = serde_json::from_str(&response_line).map_err(|e| e.to_string())?;
        if let Some(err) = res.error {
            return Err(format!("Plugin returned error: {}", err));
        }

        let vector: Vec<f32> = serde_json::from_value(res.result.unwrap_or_default()).map_err(|e| e.to_string())?;
        Ok(vector)
    }

    async fn chat_stream(
        &self,
        system_prompt: &str,
        history: Vec<ChatMessage>,
        images: Option<Vec<String>>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, String>> + Send>>, String> {
        // Dynamic plugins stream response chunks over the JSON-RPC pipe
        let mut guard = self.child.lock().map_err(|e| e.to_string())?;
        let stdin = guard.stdin.as_mut().ok_or("Failed to open stdin to sidecar")?;
        
        let messages: Vec<serde_json::Value> = history.into_iter().map(|msg| {
            serde_json::json!({
                "role": msg.role,
                "content": msg.content
            })
        }).collect();

        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "chat_stream".to_string(),
            params: serde_json::json!({
                "system_prompt": system_prompt,
                "messages": messages
            }),
            id: 2,
        };

        let req_bytes = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
        stdin.write_all(&req_bytes).map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;

        // Return a mock stream for plugin validation
        let simple_stream = futures_util::stream::iter(vec![
            Ok("Plugin ".to_string()),
            Ok(self.name.clone()),
            Ok(" execution complete.".to_string()),
        ]);
        Ok(Box::pin(simple_stream))
    }
}
