use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{Method, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio::time::{self, MissedTickBehavior};
use tower_http::cors::{Any, CorsLayer};

const BROADCAST_BUFFER_SIZE: usize = 2_048;

#[derive(Clone)]
struct AppState {
    tx: broadcast::Sender<FlowEvent>,
    seq: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FlowEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seq: Option<u64>,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_delta: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_span_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub attributes: Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl FlowEvent {
    fn new(event_type: impl Into<String>, timestamp: String) -> Self {
        Self {
            event_type: event_type.into(),
            seq: None,
            timestamp,
            event_kind: None,
            node_key: None,
            queue_delta: None,
            span_name: None,
            service_name: None,
            trace_id: None,
            span_id: None,
            parent_span_id: None,
            start_time: None,
            end_time: None,
            duration_ms: None,
            attributes: Map::new(),
            message: None,
        }
    }
}

pub fn build_app(tx: broadcast::Sender<FlowEvent>) -> Router {
    Router::new()
        .route("/v1/traces", post(post_traces))
        .route("/v1/logs", post(post_logs))
        .route("/ws", get(ws_upgrade))
        .route("/health", get(health))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    "http://localhost:5173".parse().expect("valid origin"),
                    "http://127.0.0.1:5173".parse().expect("valid origin"),
                ])
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers(Any),
        )
        .with_state(AppState {
            tx,
            seq: Arc::new(AtomicU64::new(1)),
        })
}

pub fn new_broadcaster() -> broadcast::Sender<FlowEvent> {
    let (tx, _) = broadcast::channel(BROADCAST_BUFFER_SIZE);
    tx
}

pub async fn run_server(addr: SocketAddr) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    let local_addr = listener.local_addr()?;
    tracing::info!(%local_addr, "resq-flow relay listening");
    axum::serve(listener, build_app(new_broadcaster())).await
}

async fn health() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

async fn post_traces(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let events = parse_trace_events(&payload);
    let count = events.len();

    for mut event in events {
        annotate_flow_event(&mut event, &state.seq);
        let _ = state.tx.send(event);
    }

    (StatusCode::OK, Json(json!({ "received": count })))
}

async fn post_logs(State(state): State<AppState>, Json(payload): Json<Value>) -> impl IntoResponse {
    let events = parse_log_events(&payload);
    let count = events.len();

    for mut event in events {
        annotate_flow_event(&mut event, &state.seq);
        let _ = state.tx.send(event);
    }

    (StatusCode::OK, Json(json!({ "received": count })))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| {
        handle_ws(
            socket,
            state.tx.clone(),
            state.tx.subscribe(),
            state.seq.clone(),
        )
    })
}

async fn handle_ws(
    mut socket: WebSocket,
    tx: broadcast::Sender<FlowEvent>,
    mut rx: broadcast::Receiver<FlowEvent>,
    seq: Arc<AtomicU64>,
) {
    let mut heartbeat = time::interval(Duration::from_secs(20));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    // Consume the immediate first tick so heartbeats begin after the interval.
    heartbeat.tick().await;

    loop {
        tokio::select! {
            biased;

            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(mut event) = serde_json::from_str::<FlowEvent>(&text) {
                            annotate_flow_event(&mut event, &seq);
                            let _ = tx.send(event);
                        }
                    }
                    Some(Err(err)) => {
                        tracing::debug!(error = ?err, "websocket receive error");
                        break;
                    }
                    _ => {}
                }
            }
            maybe_event = rx.recv() => {
                match maybe_event {
                    Ok(event) => {
                        let text = match serde_json::to_string(&event) {
                            Ok(serialized) => serialized,
                            Err(err) => {
                                tracing::error!(error = ?err, "failed to serialize FlowEvent");
                                continue;
                            }
                        };
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::debug!(skipped, "ws client lagged, dropping stale events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = heartbeat.tick() => {
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

pub fn parse_trace_events(payload: &Value) -> Vec<FlowEvent> {
    let mut events = Vec::new();

    let Some(resource_spans) = payload.get("resourceSpans").and_then(Value::as_array) else {
        return events;
    };

    for resource_span in resource_spans {
        let service_name = extract_service_name(resource_span);

        let Some(scope_spans) = resource_span.get("scopeSpans").and_then(Value::as_array) else {
            continue;
        };

        for scope_span in scope_spans {
            let Some(spans) = scope_span.get("spans").and_then(Value::as_array) else {
                continue;
            };

            for span in spans {
                let span_name = string_field(span, "name");
                let trace_id = string_field(span, "traceId").map(|v| normalize_identifier(&v));
                let span_id = string_field(span, "spanId").map(|v| normalize_identifier(&v));
                let parent_span_id = string_field(span, "parentSpanId")
                    .filter(|v| !v.is_empty())
                    .map(|v| normalize_identifier(&v));

                let start_nanos = parse_nanos(span.get("startTimeUnixNano"));
                let end_nanos = parse_nanos(span.get("endTimeUnixNano"));

                let start_time = start_nanos.map(nanos_to_iso);
                let end_time = end_nanos.map(nanos_to_iso);
                let duration_ms = match (start_nanos, end_nanos) {
                    (Some(start), Some(end)) if end >= start => {
                        Some(((end - start) / 1_000_000) as u64)
                    }
                    _ => None,
                };

                let mut attributes = parse_attributes(span.get("attributes"));

                if let Some(status_code) = span
                    .get("status")
                    .and_then(|status| status.get("code"))
                    .and_then(otel_value_as_string)
                {
                    attributes.insert("status".to_string(), Value::String(status_code.clone()));
                    if status_code == "STATUS_CODE_ERROR" || status_code == "2" {
                        attributes
                            .insert("outcome".to_string(), Value::String("error".to_string()));
                    }
                }

                let mut start_event =
                    FlowEvent::new("span_start", start_time.clone().unwrap_or_else(now_iso));
                start_event.span_name = span_name.clone();
                start_event.service_name = service_name.clone();
                start_event.trace_id = trace_id.clone();
                start_event.span_id = span_id.clone();
                start_event.parent_span_id = parent_span_id.clone();
                start_event.start_time = start_time.clone();
                start_event.attributes = attributes.clone();
                start_event.message = span_name
                    .clone()
                    .map(|name| format!("span started: {name}"));

                events.push(start_event);

                let mut end_event =
                    FlowEvent::new("span_end", end_time.clone().unwrap_or_else(now_iso));
                end_event.span_name = span_name;
                end_event.service_name = service_name.clone();
                end_event.trace_id = trace_id;
                end_event.span_id = span_id;
                end_event.parent_span_id = parent_span_id;
                end_event.start_time = start_time;
                end_event.end_time = end_time;
                end_event.duration_ms = duration_ms;
                end_event.attributes = attributes;
                end_event.message = end_event
                    .span_name
                    .clone()
                    .map(|name| format!("span completed: {name}"));

                events.push(end_event);
            }
        }
    }

    events
}

pub fn parse_log_events(payload: &Value) -> Vec<FlowEvent> {
    let mut events = Vec::new();

    let Some(resource_logs) = payload.get("resourceLogs").and_then(Value::as_array) else {
        return events;
    };

    for resource_log in resource_logs {
        let service_name = extract_service_name(resource_log);

        let Some(scope_logs) = resource_log.get("scopeLogs").and_then(Value::as_array) else {
            continue;
        };

        for scope_log in scope_logs {
            let Some(log_records) = scope_log.get("logRecords").and_then(Value::as_array) else {
                continue;
            };

            for log_record in log_records {
                let attributes = parse_attributes(log_record.get("attributes"));
                let event_name = attributes.get("event").and_then(otel_value_as_string);
                if event_name.as_deref() != Some("mail_e2e_event") {
                    continue;
                }

                let timestamp = parse_nanos(log_record.get("timeUnixNano"))
                    .map(nanos_to_iso)
                    .or_else(|| {
                        parse_nanos(log_record.get("observedTimeUnixNano")).map(nanos_to_iso)
                    })
                    .unwrap_or_else(now_iso);

                let trace_id =
                    string_field(log_record, "traceId").map(|v| normalize_identifier(&v));
                let span_id = string_field(log_record, "spanId").map(|v| normalize_identifier(&v));

                let mut event = FlowEvent::new("log", timestamp);
                event.service_name = service_name.clone();
                event.span_name = attributes
                    .get("span_name")
                    .and_then(otel_value_as_string)
                    .or_else(|| {
                        attributes
                            .get("function_name")
                            .and_then(otel_value_as_string)
                    });
                event.trace_id = trace_id;
                event.span_id = span_id;
                event.parent_span_id = attributes
                    .get("parent_span_id")
                    .and_then(otel_value_as_string);
                event.duration_ms = attributes
                    .get("duration_ms")
                    .and_then(otel_value_as_u64)
                    .or_else(|| {
                        let start = attributes
                            .get("start_time_unix_nano")
                            .and_then(parse_nanos_from_value);
                        let end = attributes
                            .get("end_time_unix_nano")
                            .and_then(parse_nanos_from_value);
                        match (start, end) {
                            (Some(s), Some(e)) if e >= s => Some(((e - s) / 1_000_000) as u64),
                            _ => None,
                        }
                    });
                event.message = log_record
                    .get("body")
                    .map(parse_otel_any_value)
                    .and_then(|value| otel_value_as_string(&value))
                    .or_else(|| attributes.get("message").and_then(otel_value_as_string));
                event.attributes = attributes;

                events.push(event);
            }
        }
    }

    events
}

fn annotate_flow_event(event: &mut FlowEvent, seq: &AtomicU64) {
    if event.seq.is_none() {
        event.seq = Some(seq.fetch_add(1, Ordering::Relaxed));
    }

    if event.event_kind.is_none() {
        event.event_kind = Some(infer_event_kind(event));
    }

    if event.node_key.is_none() {
        event.node_key = infer_node_key(event);
    }

    if event.queue_delta.is_none() {
        event.queue_delta = event.event_kind.as_deref().and_then(queue_delta_for_kind);
    }
}

fn infer_event_kind(event: &FlowEvent) -> String {
    match event.event_type.as_str() {
        "span_start" => "node_started".to_string(),
        "span_end" => "node_finished".to_string(),
        "log" => match event_attr_string(event, "action").as_deref() {
            Some("enqueue") => "queue_enqueued".to_string(),
            Some("worker_pickup") => "queue_picked".to_string(),
            _ => "log_event".to_string(),
        },
        _ => "event".to_string(),
    }
}

fn infer_node_key(event: &FlowEvent) -> Option<String> {
    let action = event_attr_string(event, "action");
    let queue_name = event_attr_string(event, "queue_name");
    let function_name = event_attr_string(event, "function_name");
    let worker_name = event_attr_string(event, "worker_name");
    let span_name = event.span_name.clone();
    let kind = event
        .event_kind
        .clone()
        .unwrap_or_else(|| infer_event_kind(event));

    match kind.as_str() {
        "queue_enqueued" | "queue_picked" => queue_name
            .or(function_name)
            .or(worker_name)
            .or(span_name)
            .or(action),
        _ => function_name
            .or(span_name)
            .or(worker_name)
            .or(queue_name)
            .or(action),
    }
}

fn queue_delta_for_kind(kind: &str) -> Option<i64> {
    match kind {
        "queue_enqueued" => Some(1),
        "queue_picked" => Some(-1),
        _ => None,
    }
}

fn event_attr_string(event: &FlowEvent, key: &str) -> Option<String> {
    event.attributes.get(key).and_then(otel_value_as_string)
}

fn parse_attributes(attributes: Option<&Value>) -> Map<String, Value> {
    let mut map = Map::new();

    let Some(attributes) = attributes.and_then(Value::as_array) else {
        return map;
    };

    for attribute in attributes {
        let Some(key) = attribute.get("key").and_then(Value::as_str) else {
            continue;
        };

        let Some(raw_value) = attribute.get("value") else {
            continue;
        };

        map.insert(key.to_string(), parse_otel_any_value(raw_value));
    }

    map
}

fn parse_otel_any_value(raw: &Value) -> Value {
    let Some(obj) = raw.as_object() else {
        return raw.clone();
    };

    if let Some(string_value) = obj.get("stringValue").and_then(Value::as_str) {
        return Value::String(string_value.to_string());
    }

    if let Some(bool_value) = obj.get("boolValue").and_then(Value::as_bool) {
        return Value::Bool(bool_value);
    }

    if let Some(int_value) = obj.get("intValue") {
        if let Some(parsed) = otel_value_as_i64(int_value) {
            return Value::Number(parsed.into());
        }
    }

    if let Some(double_value) = obj.get("doubleValue").and_then(Value::as_f64)
        && let Some(number) = serde_json::Number::from_f64(double_value)
    {
        return Value::Number(number);
    }

    if let Some(bytes_value) = obj.get("bytesValue").and_then(Value::as_str) {
        return Value::String(bytes_value.to_string());
    }

    if let Some(array_values) = obj
        .get("arrayValue")
        .and_then(|v| v.get("values"))
        .and_then(Value::as_array)
    {
        let values = array_values.iter().map(parse_otel_any_value).collect();
        return Value::Array(values);
    }

    if let Some(kv_values) = obj
        .get("kvlistValue")
        .and_then(|v| v.get("values"))
        .and_then(Value::as_array)
    {
        let mut out = Map::new();
        for item in kv_values {
            let Some(key) = item.get("key").and_then(Value::as_str) else {
                continue;
            };
            let Some(value) = item.get("value") else {
                continue;
            };
            out.insert(key.to_string(), parse_otel_any_value(value));
        }
        return Value::Object(out);
    }

    raw.clone()
}

fn extract_service_name(resource_node: &Value) -> Option<String> {
    let attributes = resource_node
        .get("resource")
        .and_then(|resource| resource.get("attributes"));
    let map = parse_attributes(attributes);
    map.get("service.name").and_then(otel_value_as_string)
}

fn string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(otel_value_as_string)
}

fn parse_nanos(value: Option<&Value>) -> Option<i128> {
    value.and_then(parse_nanos_from_value)
}

fn parse_nanos_from_value(value: &Value) -> Option<i128> {
    if let Some(number) = value.as_i64() {
        return Some(number as i128);
    }
    if let Some(number) = value.as_u64() {
        return Some(number as i128);
    }
    value.as_str().and_then(|v| v.parse::<i128>().ok())
}

fn otel_value_as_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number);
    }
    if let Some(number) = value.as_u64() {
        return i64::try_from(number).ok();
    }
    value.as_str().and_then(|v| v.parse::<i64>().ok())
}

fn otel_value_as_u64(value: &Value) -> Option<u64> {
    if let Some(number) = value.as_u64() {
        return Some(number);
    }
    if let Some(number) = value.as_i64() {
        return u64::try_from(number).ok();
    }
    if let Some(number) = value.as_f64() {
        if number.is_finite() && number >= 0.0 {
            return Some(number as u64);
        }
    }
    value.as_str().and_then(|v| v.parse::<u64>().ok())
}

fn otel_value_as_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::Null => None,
        _ => Some(value.to_string()),
    }
}

fn normalize_identifier(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return trimmed.to_ascii_lowercase();
    }

    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(trimmed) {
        return bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
    }

    trimmed.to_string()
}

fn nanos_to_iso(nanos: i128) -> String {
    let seconds = nanos / 1_000_000_000;
    let nanos_part = (nanos.rem_euclid(1_000_000_000)) as u32;

    DateTime::<Utc>::from_timestamp(seconds as i64, nanos_part)
        .unwrap_or_else(Utc::now)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
