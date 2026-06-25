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

#[derive(Clone)]
pub struct WebState {
    pub input_tx: mpsc::Sender<String>,
    pub ws_tx: broadcast::Sender<String>,
    pub active_agent: Arc<Mutex<String>>,
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
) {
    let state = WebState {
        input_tx,
        ws_tx,
        active_agent,
    };

    tokio::spawn(async move {
        let app = Router::new()
            .route("/", get(serve_index))
            .route("/api/chat", post(handle_chat))
            .route("/api/ws", get(handle_ws))
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
        "ram": 24, 
        "cpu": 1,
        "tps": "0",
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
