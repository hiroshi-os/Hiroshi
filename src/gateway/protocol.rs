#![allow(unused)]
use serde::{Serialize, Deserialize};

/// Strongly typed protocol frame boundary for all gateway I/O.
///
/// Every message crossing the gateway boundary is deserialized into one of
/// three discriminated variants. The `deny_unknown_fields` attribute on each
/// inner struct ensures malformed or injected parameters are rejected at the
/// serde layer before any business logic executes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum GatewayFrame {
    #[serde(rename = "req")]
    Req(RequestFrame),
    #[serde(rename = "res")]
    Res(ResponseFrame),
    #[serde(rename = "event")]
    Event(EventFrame),
}

/// An inbound request frame carrying a method invocation with typed parameters.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RequestFrame {
    /// Unique request correlation identifier.
    pub id: String,
    /// The remote method route being invoked.
    pub method: String,
    /// Structured parameter table (validated downstream per-method).
    pub params: serde_json::Value,
    /// Unix epoch milliseconds when the request was created.
    pub timestamp: i64,
}

/// An outbound response frame with success/error semantics.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ResponseFrame {
    /// Correlation identifier matching the originating request.
    pub id: String,
    /// Whether the operation completed successfully.
    pub ok: bool,
    /// Structured payload on success.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    /// Structured error detail on failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

/// Nested error detail dictionary for structured failure reporting.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ErrorDetail {
    /// Machine-readable error code.
    pub code: i32,
    /// Human-readable error message.
    pub message: String,
    /// Optional extended diagnostic detail.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// A broadcast event frame for streaming state changes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EventFrame {
    /// The event type identifier.
    pub event: String,
    /// Monotonically increasing sequence number within a session.
    pub seq: u64,
    /// Structured event payload.
    pub data: serde_json::Value,
    /// Unix epoch milliseconds when the event was emitted.
    pub timestamp: i64,
}

// ---------------------------------------------------------------------------
// Convenience constructors
// ---------------------------------------------------------------------------

impl GatewayFrame {
    /// Create a new request frame.
    pub fn request(id: impl Into<String>, method: impl Into<String>, params: serde_json::Value) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        GatewayFrame::Req(RequestFrame {
            id: id.into(),
            method: method.into(),
            params,
            timestamp: now,
        })
    }

    /// Create a success response frame.
    pub fn success(id: impl Into<String>, payload: serde_json::Value) -> Self {
        GatewayFrame::Res(ResponseFrame {
            id: id.into(),
            ok: true,
            payload: Some(payload),
            error: None,
        })
    }

    /// Create an error response frame.
    pub fn error(id: impl Into<String>, code: i32, message: impl Into<String>, detail: Option<String>) -> Self {
        GatewayFrame::Res(ResponseFrame {
            id: id.into(),
            ok: false,
            payload: None,
            error: Some(ErrorDetail {
                code,
                message: message.into(),
                detail,
            }),
        })
    }

    /// Create a broadcast event frame.
    pub fn event(event_type: impl Into<String>, seq: u64, data: serde_json::Value) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        GatewayFrame::Event(EventFrame {
            event: event_type.into(),
            seq,
            data,
            timestamp: now,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_roundtrip() {
        let frame = GatewayFrame::Req(RequestFrame {
            id: "req-001".to_string(),
            method: "agent.chat".to_string(),
            params: serde_json::json!({"text": "hello"}),
            timestamp: 1719700000000,
        });
        let json = serde_json::to_string(&frame).unwrap();
        let parsed: GatewayFrame = serde_json::from_str(&json).unwrap();
        assert_eq!(frame, parsed);
    }

    #[test]
    fn test_response_success_roundtrip() {
        let frame = GatewayFrame::success("res-001", serde_json::json!({"reply": "world"}));
        let json = serde_json::to_string(&frame).unwrap();
        let parsed: GatewayFrame = serde_json::from_str(&json).unwrap();
        assert_eq!(frame, parsed);
    }

    #[test]
    fn test_response_error_roundtrip() {
        let frame = GatewayFrame::error("res-002", 400, "Bad request", Some("missing field".to_string()));
        let json = serde_json::to_string(&frame).unwrap();
        let parsed: GatewayFrame = serde_json::from_str(&json).unwrap();
        assert_eq!(frame, parsed);
    }

    #[test]
    fn test_event_roundtrip() {
        let frame = GatewayFrame::Event(EventFrame {
            event: "agent_shift".to_string(),
            seq: 42,
            data: serde_json::json!({"from": "Architect", "to": "Developer"}),
            timestamp: 1719700000000,
        });
        let json = serde_json::to_string(&frame).unwrap();
        let parsed: GatewayFrame = serde_json::from_str(&json).unwrap();
        assert_eq!(frame, parsed);
    }

    #[test]
    fn test_deny_unknown_fields_request() {
        let bad_json = r#"{"type":"req","id":"x","method":"m","params":{},"timestamp":0,"extra":"bad"}"#;
        let result = serde_json::from_str::<GatewayFrame>(bad_json);
        assert!(result.is_err(), "Should reject unknown field 'extra'");
    }

    #[test]
    fn test_deny_unknown_fields_response() {
        let bad_json = r#"{"type":"res","id":"x","ok":true,"injected":true}"#;
        let result = serde_json::from_str::<GatewayFrame>(bad_json);
        assert!(result.is_err(), "Should reject unknown field 'injected'");
    }

    #[test]
    fn test_deny_unknown_fields_event() {
        let bad_json = r#"{"type":"event","event":"e","seq":0,"data":{},"timestamp":0,"poison":"yes"}"#;
        let result = serde_json::from_str::<GatewayFrame>(bad_json);
        assert!(result.is_err(), "Should reject unknown field 'poison'");
    }

    #[test]
    fn test_tag_dispatch() {
        let req_json = r#"{"type":"req","id":"1","method":"ping","params":null,"timestamp":0}"#;
        let res_json = r#"{"type":"res","id":"2","ok":true}"#;
        let evt_json = r#"{"type":"event","event":"tick","seq":1,"data":null,"timestamp":0}"#;

        assert!(matches!(serde_json::from_str::<GatewayFrame>(req_json).unwrap(), GatewayFrame::Req(_)));
        assert!(matches!(serde_json::from_str::<GatewayFrame>(res_json).unwrap(), GatewayFrame::Res(_)));
        assert!(matches!(serde_json::from_str::<GatewayFrame>(evt_json).unwrap(), GatewayFrame::Event(_)));
    }
}
