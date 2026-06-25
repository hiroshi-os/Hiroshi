use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    method: String,
    params: Value,
    id: u64,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct JsonRpcResponse {
    jsonrpc: String,
    result: Option<Value>,
    error: Option<Value>,
    id: Option<Value>,
}

pub struct McpClient {
    name: String,
    command: String,
    args: Vec<String>,
    child: Arc<Mutex<Option<Child>>>,
    request_counter: Arc<Mutex<u64>>,
}

impl McpClient {
    pub fn new(name: String, command: String, args: Vec<String>) -> Self {
        Self {
            name,
            command,
            args,
            child: Arc::new(Mutex::new(None)),
            request_counter: Arc::new(Mutex::new(0)),
        }
    }

    pub async fn start(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().await;
        if child_guard.is_some() {
            return Ok(());
        }

        let mut cmd = Command::new(&self.command);
        cmd.args(&self.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let spawned = cmd.spawn()
            .map_err(|e| format!("Failed to spawn MCP server '{}' command '{}': {}", self.name, self.command, e))?;

        *child_guard = Some(spawned);
        Ok(())
    }

    pub async fn call_rpc(&self, method: &str, params: Value) -> Result<Value, String> {
        self.start().await?;

        let mut child_guard = self.child.lock().await;
        let child = child_guard.as_mut().ok_or_else(|| "MCP child not spawned".to_string())?;

        let stdin = child.stdin.as_mut().ok_or_else(|| "MCP stdin not available".to_string())?;
        let stdout = child.stdout.as_mut().ok_or_else(|| "MCP stdout not available".to_string())?;

        let mut counter = self.request_counter.lock().await;
        *counter += 1;
        let id = *counter;

        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
            id,
        };

        let mut req_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        req_str.push('\n');

        stdin.write_all(req_str.as_bytes()).await
            .map_err(|e| format!("Failed to write to MCP stdin: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("Failed to flush MCP stdin: {}", e))?;

        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).await
            .map_err(|e| format!("Failed to read from MCP stdout: {}", e))?;

        let response: JsonRpcResponse = serde_json::from_str(&line)
            .map_err(|e| format!("Failed to parse JSON-RPC response from line '{}': {}", line, e))?;

        if let Some(err) = response.error {
            return Err(format!("MCP Server returned error: {:?}", err));
        }

        response.result.ok_or_else(|| "Missing result in JSON-RPC response".to_string())
    }

    pub async fn initialize(&self) -> Result<(), String> {
        let params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "Hiroshi",
                "version": "0.1.0"
            }
        });
        self.call_rpc("initialize", params).await?;
        Ok(())
    }

    pub async fn list_tools(&self) -> Result<Vec<Value>, String> {
        let res = self.call_rpc("tools/list", serde_json::json!({})).await?;
        if let Some(tools) = res.get("tools").and_then(|t| t.as_array()) {
            Ok(tools.clone())
        } else {
            Ok(vec![])
        }
    }

    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<String, String> {
        let params = serde_json::json!({
            "name": name,
            "arguments": arguments
        });
        let res = self.call_rpc("tools/call", params).await?;
        if let Some(content) = res.get("content").and_then(|c| c.as_array()) {
            let mut out = String::new();
            for item in content {
                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                    out.push_str(text);
                }
            }
            Ok(out)
        } else {
            Ok(format!("{:?}", res))
        }
    }
}

pub struct McpRegistry {
    pub clients: HashMap<String, Arc<McpClient>>,
}

impl McpRegistry {
    pub fn new(mcp_config: &HashMap<String, crate::config::McpServerConfig>) -> Self {
        let mut clients = HashMap::new();
        for (name, conf) in mcp_config {
            clients.insert(
                name.clone(),
                Arc::new(McpClient::new(name.clone(), conf.command.clone(), conf.args.clone())),
            );
        }
        Self { clients }
    }

    pub async fn initialize_all(&self) {
        for (name, client) in &self.clients {
            if let Err(e) = client.initialize().await {
                tracing::error!("Failed to initialize MCP client '{}': {}", name, e);
            } else {
                tracing::info!("MCP client '{}' initialized successfully.", name);
            }
        }
    }

    pub async fn get_all_tools(&self) -> Vec<Value> {
        let mut all_tools = Vec::new();
        for (name, client) in &self.clients {
            if let Ok(tools) = client.list_tools().await {
                for mut tool in tools {
                    if let Some(obj) = tool.as_object_mut() {
                        if let Some(t_name) = obj.get("name").and_then(|n| n.as_str()) {
                            let namespaced = format!("{}__{}", name, t_name);
                            obj.insert("name".to_string(), Value::String(namespaced));
                        }
                        obj.insert("mcp_server".to_string(), Value::String(name.clone()));
                    }
                    all_tools.push(tool);
                }
            }
        }
        all_tools
    }

    pub async fn execute_tool(&self, namespaced_name: &str, arguments: Value) -> Result<String, String> {
        if let Some(pos) = namespaced_name.find("__") {
            let server_name = &namespaced_name[..pos];
            let tool_name = &namespaced_name[pos + 2..];
            if let Some(client) = self.clients.get(server_name) {
                client.call_tool(tool_name, arguments).await
            } else {
                Err(format!("MCP Server '{}' not found in registry", server_name))
            }
        } else {
            Err(format!("Invalid namespaced MCP tool name: '{}'", namespaced_name))
        }
    }
}
