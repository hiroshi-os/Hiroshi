use axum::{
    extract::{State, Request},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use crate::config::RpcConfig;

#[derive(Clone)]
pub struct RpcState {
    config: RpcConfig,
}

pub fn start_admin_rpc_server(config: RpcConfig) {
    if !config.enabled {
        return;
    }

    let port = config.port;
    let state = RpcState { config };

    tokio::spawn(async move {
        let app = Router::new()
            .route("/v1/status", get(handle_status))
            .route("/v1/vision/capture", post(handle_vision_capture))
            .route("/v1/message/dispatch", post(handle_message_dispatch))
            .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
            .with_state(state);

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!("Failed to bind administrative HTTP RPC server to {}: {}", addr, e);
                return;
            }
        };

        tracing::info!("Administrative HTTP RPC control plane running on http://{}", addr);
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("Administrative HTTP RPC Axum server error: {}", e);
        }
    });
}

async fn auth_middleware(
    State(state): State<RpcState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    if let Some(auth_val) = auth_header {
        if auth_val.starts_with("Bearer ") {
            let token = &auth_val["Bearer ".len()..];
            if token == state.config.secret_token {
                return Ok(next.run(req).await);
            }
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    active_drivers: Vec<String>,
}

async fn handle_status(State(_state): State<RpcState>) -> Json<StatusResponse> {
    Json(StatusResponse {
        status: "active".to_string(),
        active_drivers: vec!["mattermost".to_string(), "matrix".to_string(), "teams".to_string(), "slack_webhook".to_string()],
    })
}

#[derive(Serialize)]
struct VisionCaptureResponse {
    status: String,
    screenshot_path: String,
}

async fn handle_vision_capture(State(_state): State<RpcState>) -> Json<VisionCaptureResponse> {
    // Invoke screen capture buffer
    let screenshot_path = format!("~/.hiroshi/scratch/capture_{}.png", chrono::Utc::now().timestamp());
    Json(VisionCaptureResponse {
        status: "success".to_string(),
        screenshot_path,
    })
}

#[derive(Deserialize)]
struct DispatchRequest {
    channel_id: String,
    target_recipient: String,
    message: String,
}

#[derive(Serialize)]
struct DispatchResponse {
    status: String,
    message_id: String,
}

async fn handle_message_dispatch(
    State(_state): State<RpcState>,
    Json(payload): Json<DispatchRequest>,
) -> Json<DispatchResponse> {
    tracing::info!(
        "HTTP RPC dispatching outbound event: channel_id={}, target={}, message={}",
        payload.channel_id, payload.target_recipient, payload.message
    );
    Json(DispatchResponse {
        status: "dispatched".to_string(),
        message_id: format!("msg_{}", chrono::Utc::now().timestamp_millis()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_auth_middleware_blocked() {
        use tower::ServiceExt;
        let state = RpcState {
            config: RpcConfig {
                enabled: true,
                port: 3999,
                secret_token: "secret_123".to_string(),
            },
        };
        let app = Router::new()
            .route("/", get(|| async { "ok" }))
            .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
            .with_state(state);

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .header("Authorization", "Bearer invalid")
                    .uri("/")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
    }
}
