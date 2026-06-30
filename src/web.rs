use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::Html,
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use std::net::SocketAddr;
use std::sync::Mutex;
use tokio::sync::{mpsc, broadcast};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Clone)]
pub struct WebState {
    pub input_tx: mpsc::Sender<String>,
    pub ws_tx: broadcast::Sender<String>,
    pub active_agent: Arc<Mutex<String>>,
    pub disabled_skills: Arc<Mutex<std::collections::HashSet<String>>>,
    pub skills_dir: PathBuf,
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
}

pub fn start_web_server(
    addr: SocketAddr,
    input_tx: mpsc::Sender<String>,
    ws_tx: broadcast::Sender<String>,
    active_agent: Arc<Mutex<String>>,
    disabled_skills: Arc<Mutex<std::collections::HashSet<String>>>,
    skills_dir: PathBuf,
) {
    let state = WebState {
        input_tx,
        ws_tx,
        active_agent,
        disabled_skills,
        skills_dir,
    };

    tokio::spawn(async move {
        let app = Router::new()
            .route("/", get(serve_index))
            .route("/api/chat", post(handle_chat))
            .route("/api/ws", get(handle_ws))
            .route("/api/skills", get(handle_get_skills))
            .route("/api/skills/toggle", post(handle_toggle_skill))
            .with_state(state);

        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("Failed to bind Axum web server to {}: {}", addr, e);
                return;
            }
        };

        tracing::info!("Hiroshi Local Dashboard Web Server running on http://{}", addr);
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("Axum server error: {}", e);
        }
    });
}

async fn serve_index() -> Html<&'static str> {
    Html(include_str!("index.html"))
}

async fn handle_chat(
    State(state): State<WebState>,
    Json(payload): Json<ChatRequest>,
) -> Json<serde_json::Value> {
    let _ = state.input_tx.send(payload.message).await;
    Json(serde_json::json!({ "status": "sent" }))
}

async fn handle_ws(
    ws: WebSocketUpgrade,
    State(state): State<WebState>,
) -> axum::response::Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: WebState) {
    let mut rx = state.ws_tx.subscribe();
    
    let active = {
        let guard = state.active_agent.lock().unwrap();
        guard.clone()
    };
    let initial_metrics = serde_json::json!({
        "type": "metrics",
        "ram": 18, 
        "cpu": 0.5,
        "tps": "0.1",
        "active_agent": active
    });
    if let Ok(m_str) = serde_json::to_string(&initial_metrics) {
        let _ = socket.send(Message::Text(m_str.into())).await;
    }

    while let Ok(msg) = rx.recv().await {
        if socket.send(Message::Text(msg.into())).await.is_err() {
            break;
        }
    }
}

async fn handle_get_skills(
    State(state): State<WebState>,
) -> Json<serde_json::Value> {
    let registry = match crate::skills::SkillsRegistry::scan_dir(&state.skills_dir) {
        Ok(r) => r,
        Err(_) => return Json(serde_json::json!([])),
    };
    let disabled = state.disabled_skills.lock().unwrap();
    let list: Vec<serde_json::Value> = registry.list_skills().iter().map(|s| {
        serde_json::json!({
            "name": s.name,
            "description": s.description,
            "schema": s.schema,
            "enabled": !disabled.contains(&s.name),
            "is_mcp": s.name.starts_with("mcp__"),
        })
    }).collect();
    Json(serde_json::json!(list))
}

#[derive(Deserialize)]
struct ToggleSkillRequest {
    name: String,
    enabled: bool,
}

async fn handle_toggle_skill(
    State(state): State<WebState>,
    Json(payload): Json<ToggleSkillRequest>,
) -> Json<serde_json::Value> {
    {
        let mut disabled = state.disabled_skills.lock().unwrap();
        if payload.enabled {
            disabled.remove(&payload.name);
        } else {
            disabled.insert(payload.name.clone());
        }
    }
    
    let ws_msg = serde_json::json!({
        "type": "skill_toggle",
        "name": payload.name,
        "enabled": payload.enabled
    });
    if let Ok(msg_str) = serde_json::to_string(&ws_msg) {
        let _ = state.ws_tx.send(msg_str);
    }
    
    Json(serde_json::json!({ "status": "ok" }))
}
