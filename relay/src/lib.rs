use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::extract::Query;
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
const DEFAULT_HISTORY_WINDOW_SECS: i64 = 30 * 60;
const MAX_HISTORY_WINDOW_SECS: i64 = 7 * 24 * 60 * 60;
const DEFAULT_HISTORY_LIMIT: usize = 8_000;
const MAX_HISTORY_LIMIT: usize = 20_000;
const DEFAULT_HISTORY_TIMEOUT_SECS: u64 = 8;

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

#[derive(Debug, Deserialize)]
struct HistoryQuery {
    from: Option<String>,
    to: Option<String>,
    window: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
struct HistoryResponse {
    from: String,
    to: String,
    query: Option<String>,
    events: Vec<FlowEvent>,
    log_count: usize,
    span_count: usize,
    truncated: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct JaegerServicesResponse {
    data: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct JaegerTracesResponse {
    data: Vec<JaegerTrace>,
}

#[derive(Debug, Deserialize)]
struct JaegerTrace {
    #[serde(rename = "traceID")]
    trace_id: String,
    #[serde(default)]
    spans: Vec<JaegerSpan>,
    #[serde(default)]
    processes: HashMap<String, JaegerProcess>,
}

#[derive(Debug, Deserialize)]
struct JaegerSpan {
    #[serde(rename = "traceID")]
    trace_id: String,
    #[serde(rename = "spanID")]
    span_id: String,
    #[serde(rename = "operationName")]
    operation_name: String,
    #[serde(rename = "processID", default)]
    process_id: String,
    #[serde(rename = "startTime", default)]
    start_time_us: i64,
    #[serde(default)]
    duration: i64,
    #[serde(default, rename = "references")]
    references: Vec<JaegerReference>,
    #[serde(default)]
    tags: Vec<JaegerTag>,
}

#[derive(Debug, Deserialize)]
struct JaegerReference {
    #[serde(rename = "refType")]
    ref_type: String,
    #[serde(rename = "traceID")]
    trace_id: String,
    #[serde(rename = "spanID")]
    span_id: String,
}

#[derive(Debug, Deserialize)]
struct JaegerTag {
    key: String,
    value: Value,
}

#[derive(Debug, Deserialize)]
struct JaegerProcess {
    #[serde(rename = "serviceName")]
    service_name: String,
}

pub fn build_app(tx: broadcast::Sender<FlowEvent>) -> Router {
    Router::new()
        .route("/v1/traces", post(post_traces))
        .route("/v1/logs", post(post_logs))
        .route("/v1/history", get(get_history))
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

async fn get_history(Query(query): Query<HistoryQuery>) -> impl IntoResponse {
    let (start, end) = match resolve_history_range(&query) {
        Ok(range) => range,
        Err(message) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))).into_response();
        }
    };

    let search = query
        .query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let max_events = query
        .limit
        .unwrap_or(DEFAULT_HISTORY_LIMIT)
        .clamp(1, MAX_HISTORY_LIMIT);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(history_timeout_secs()))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("failed to build history client: {err}") })),
            )
                .into_response();
        }
    };

    let (log_result, span_result) = tokio::join!(
        fetch_history_logs(&client, start, end, search.as_deref(), max_events),
        fetch_history_spans(&client, start, end, search.as_deref(), max_events),
    );

    let mut warnings = Vec::new();

    let mut log_events = match log_result {
        Ok(events) => events,
        Err(err) => {
            warnings.push(format!("logs unavailable: {err}"));
            Vec::new()
        }
    };

    let mut span_events = match span_result {
        Ok(events) => events,
        Err(err) => {
            warnings.push(format!("traces unavailable: {err}"));
            Vec::new()
        }
    };

    let log_count = log_events.len();
    let span_count = span_events.len();

    let mut events = Vec::with_capacity(log_count + span_count);
    events.append(&mut log_events);
    events.append(&mut span_events);
    sort_events_for_timeline(&mut events);
    assign_history_sequence_and_annotations(&mut events);

    let truncated = events.len() > max_events;
    if truncated {
        let start_index = events.len().saturating_sub(max_events);
        events = events.split_off(start_index);
        assign_history_sequence_and_annotations(&mut events);
    }

    if events.is_empty() && warnings.is_empty() {
        warnings.push("no events found in requested time window".to_string());
    }

    let response = HistoryResponse {
        from: start.to_rfc3339_opts(SecondsFormat::Millis, true),
        to: end.to_rfc3339_opts(SecondsFormat::Millis, true),
        query: search,
        events,
        log_count,
        span_count,
        truncated,
        warnings,
    };

    (StatusCode::OK, Json(response)).into_response()
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

fn resolve_history_range(query: &HistoryQuery) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
    let end = query
        .to
        .as_deref()
        .map(parse_rfc3339_utc)
        .transpose()?
        .unwrap_or_else(Utc::now);

    let window_secs = query
        .window
        .as_deref()
        .map(parse_window_secs)
        .transpose()?
        .unwrap_or(DEFAULT_HISTORY_WINDOW_SECS)
        .clamp(1, MAX_HISTORY_WINDOW_SECS);

    let mut start = query
        .from
        .as_deref()
        .map(parse_rfc3339_utc)
        .transpose()?
        .unwrap_or_else(|| end - chrono::Duration::seconds(window_secs));

    let max_window_start = end - chrono::Duration::seconds(MAX_HISTORY_WINDOW_SECS);
    if start < max_window_start {
        start = max_window_start;
    }

    if start >= end {
        return Err("history range is invalid: from must be before to".to_string());
    }

    Ok((start, end))
}

fn parse_rfc3339_utc(raw: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(raw)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|err| format!("invalid datetime `{raw}`: {err}"))
}

fn parse_window_secs(raw: &str) -> Result<i64, String> {
    let value = raw.trim().to_lowercase();
    if value.is_empty() {
        return Err("window cannot be empty".to_string());
    }

    let split_at = value
        .find(|char: char| !char.is_ascii_digit())
        .unwrap_or(value.len());
    let (digits, unit) = value.split_at(split_at);

    if digits.is_empty() {
        return Err(format!("invalid window `{raw}`"));
    }

    let amount = digits
        .parse::<i64>()
        .map_err(|_| format!("invalid window amount `{raw}`"))?;
    if amount <= 0 {
        return Err(format!("window must be positive: `{raw}`"));
    }

    let multiplier = match unit {
        "" | "s" => 1,
        "m" => 60,
        "h" => 60 * 60,
        "d" => 24 * 60 * 60,
        _ => return Err(format!("unsupported window unit in `{raw}`")),
    };

    Ok(amount.saturating_mul(multiplier))
}

fn history_timeout_secs() -> u64 {
    std::env::var("RESQ_FLOW_HISTORY_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_HISTORY_TIMEOUT_SECS)
}

fn vlogs_query_url() -> String {
    std::env::var("RESQ_FLOW_VLOGS_QUERY_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:9428/select/logsql/query".to_string())
}

fn vtraces_base_url() -> String {
    std::env::var("RESQ_FLOW_VTRACES_BASE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:10428".to_string())
}

fn trace_service_allowlist() -> Option<HashSet<String>> {
    let raw = std::env::var("RESQ_FLOW_HISTORY_TRACE_SERVICES").ok()?;
    let values: HashSet<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect();
    if values.is_empty() {
        return None;
    }
    Some(values)
}

fn build_history_logs_query(search: Option<&str>) -> String {
    let mut query = "event:mail_e2e_event".to_string();
    if let Some(term) = search.filter(|value| !value.trim().is_empty()) {
        let quoted = quote_logsql_string(term.trim());
        let clauses = [
            format!("trace_id:{quoted}"),
            format!("job_id:{quoted}"),
            format!("request_id:{quoted}"),
            format!("thread_id:{quoted}"),
            format!("reply_draft_id:{quoted}"),
            format!("journey_key:{quoted}"),
            format!("stage_id:{quoted}"),
            format!("function_name:{quoted}"),
            format!("queue_name:{quoted}"),
        ];
        query.push_str(" and (");
        query.push_str(&clauses.join(" or "));
        query.push(')');
    }
    query
}

fn quote_logsql_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for char in value.chars() {
        match char {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(char),
        }
    }
    out.push('"');
    out
}

async fn fetch_history_logs(
    client: &reqwest::Client,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    search: Option<&str>,
    limit: usize,
) -> Result<Vec<FlowEvent>, String> {
    let query = build_history_logs_query(search);
    let response = client
        .get(vlogs_query_url())
        .query(&[
            ("query", query),
            ("limit", limit.to_string()),
            ("start", start.timestamp().to_string()),
            ("end", end.timestamp().to_string()),
        ])
        .send()
        .await
        .map_err(|err| format!("history logs request failed: {err}"))?
        .error_for_status()
        .map_err(|err| format!("history logs endpoint returned error: {err}"))?;

    let body = response
        .text()
        .await
        .map_err(|err| format!("history logs body read failed: {err}"))?;

    let mut events = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value = match serde_json::from_str::<Value>(trimmed) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(event) = map_logsql_line_to_flow_event(&value) else {
            continue;
        };
        if !search_matches_event_map(search, &event.attributes, event.trace_id.as_deref()) {
            continue;
        }
        events.push(event);
    }

    Ok(events)
}

fn map_logsql_line_to_flow_event(value: &Value) -> Option<FlowEvent> {
    let object = value.as_object()?;

    if let Some(event_name) = object_string(object, "event")
        && event_name != "mail_e2e_event"
    {
        return None;
    }

    let timestamp = object_string(object, "_time")
        .or_else(|| object_string(object, "timestamp"))
        .or_else(|| object_string(object, "time"))
        .unwrap_or_else(now_iso);

    let mut event = FlowEvent::new("log", timestamp);
    event.trace_id = object_string(object, "trace_id").map(|value| normalize_identifier(&value));
    event.span_id = object_string(object, "span_id").map(|value| normalize_identifier(&value));
    event.parent_span_id = object_string(object, "parent_span_id");
    event.span_name = object_string(object, "span_name")
        .or_else(|| object_string(object, "function_name"))
        .or_else(|| object_string(object, "operationName"));
    event.service_name = object_string(object, "service_name")
        .or_else(|| object_string(object, "service"))
        .or_else(|| object_string(object, "serviceName"));
    event.duration_ms = object_u64(object, "duration_ms");
    event.message = object_string(object, "_msg")
        .or_else(|| object_string(object, "message"))
        .or_else(|| event.span_name.clone());
    event.attributes = object.clone();

    Some(event)
}

async fn fetch_history_spans(
    client: &reqwest::Client,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    search: Option<&str>,
    limit: usize,
) -> Result<Vec<FlowEvent>, String> {
    let base = vtraces_base_url();
    let mut services = fetch_trace_services(client, &base).await?;
    if let Some(allowlist) = trace_service_allowlist() {
        services.retain(|service| allowlist.contains(service));
    }
    if services.is_empty() {
        return Ok(Vec::new());
    }

    let per_service_limit = usize::max(limit / services.len(), 80).min(1_200);
    let mut events = Vec::new();
    let mut successful_queries = 0usize;
    let mut failed_queries = 0usize;

    for service in services {
        match fetch_traces_for_service(client, &base, &service, start, end, per_service_limit).await
        {
            Ok(traces) => {
                successful_queries += 1;
                for trace in traces {
                    map_jaeger_trace_to_flow_events(&trace, search, &mut events);
                }
            }
            Err(err) => {
                failed_queries += 1;
                tracing::debug!(%service, error = %err, "history trace query failed");
            }
        }
    }

    if successful_queries == 0 && failed_queries > 0 {
        return Err(format!(
            "failed to query traces for {} service(s)",
            failed_queries
        ));
    }

    dedupe_history_events(&mut events);
    Ok(events)
}

async fn fetch_trace_services(
    client: &reqwest::Client,
    vtraces_base_url: &str,
) -> Result<Vec<String>, String> {
    let url = format!(
        "{}/select/jaeger/api/services",
        vtraces_base_url.trim_end_matches('/')
    );
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("history traces services request failed: {err}"))?
        .error_for_status()
        .map_err(|err| format!("history traces services endpoint returned error: {err}"))?;

    let payload = response
        .json::<JaegerServicesResponse>()
        .await
        .map_err(|err| format!("history traces services parse failed: {err}"))?;

    Ok(payload.data)
}

async fn fetch_traces_for_service(
    client: &reqwest::Client,
    vtraces_base_url: &str,
    service: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    limit: usize,
) -> Result<Vec<JaegerTrace>, String> {
    let url = format!(
        "{}/select/jaeger/api/traces",
        vtraces_base_url.trim_end_matches('/')
    );
    let response = client
        .get(url)
        .query(&[
            ("service", service.to_string()),
            ("limit", limit.to_string()),
            ("start", start.timestamp_micros().to_string()),
            ("end", end.timestamp_micros().to_string()),
        ])
        .send()
        .await
        .map_err(|err| format!("history traces request failed for `{service}`: {err}"))?
        .error_for_status()
        .map_err(|err| format!("history traces endpoint returned error for `{service}`: {err}"))?;

    let payload = response
        .json::<JaegerTracesResponse>()
        .await
        .map_err(|err| format!("history traces parse failed for `{service}`: {err}"))?;

    Ok(payload.data)
}

fn map_jaeger_trace_to_flow_events(
    trace: &JaegerTrace,
    search: Option<&str>,
    out: &mut Vec<FlowEvent>,
) {
    for span in &trace.spans {
        let trace_id = normalize_identifier(if span.trace_id.is_empty() {
            &trace.trace_id
        } else {
            &span.trace_id
        });
        let span_id = normalize_identifier(&span.span_id);
        if span_id.is_empty() {
            continue;
        }

        let service_name = trace
            .processes
            .get(&span.process_id)
            .map(|process| process.service_name.clone());
        let parent_span_id = resolve_parent_span_id(&trace_id, &span.references);
        let mut attributes = map_jaeger_tags(&span.tags);
        if let Some(service) = service_name.as_ref() {
            attributes.insert("service_name".to_string(), Value::String(service.clone()));
        }
        attributes.insert(
            "operation_name".to_string(),
            Value::String(span.operation_name.clone()),
        );

        if !search_matches_span(
            search,
            &trace_id,
            &span_id,
            &span.operation_name,
            service_name.as_deref(),
            &attributes,
        ) {
            continue;
        }

        let safe_start_us = span.start_time_us.max(0) as i128;
        let safe_duration_us = span.duration.max(0) as i128;
        let start_nanos = safe_start_us.saturating_mul(1_000);
        let end_nanos = safe_start_us
            .saturating_add(safe_duration_us)
            .saturating_mul(1_000);
        let start_iso = nanos_to_iso(start_nanos);
        let end_iso = nanos_to_iso(end_nanos);
        let duration_ms = if safe_duration_us <= 0 {
            Some(0)
        } else {
            Some((safe_duration_us as u64) / 1_000)
        };

        let mut start_event = FlowEvent::new("span_start", start_iso.clone());
        start_event.span_name = Some(span.operation_name.clone());
        start_event.service_name = service_name.clone();
        start_event.trace_id = Some(trace_id.clone());
        start_event.span_id = Some(span_id.clone());
        start_event.parent_span_id = parent_span_id.clone();
        start_event.start_time = Some(start_iso.clone());
        start_event.attributes = attributes.clone();
        start_event.message = Some(format!("span started: {}", span.operation_name));
        out.push(start_event);

        let mut end_event = FlowEvent::new("span_end", end_iso.clone());
        end_event.span_name = Some(span.operation_name.clone());
        end_event.service_name = service_name;
        end_event.trace_id = Some(trace_id);
        end_event.span_id = Some(span_id);
        end_event.parent_span_id = parent_span_id;
        end_event.start_time = Some(start_iso);
        end_event.end_time = Some(end_iso);
        end_event.duration_ms = duration_ms;
        end_event.attributes = attributes;
        end_event.message = Some(format!("span completed: {}", span.operation_name));
        out.push(end_event);
    }
}

fn resolve_parent_span_id(trace_id: &str, references: &[JaegerReference]) -> Option<String> {
    references
        .iter()
        .find(|reference| {
            reference.ref_type.eq_ignore_ascii_case("child_of")
                && normalize_identifier(&reference.trace_id) == trace_id
                && !reference.span_id.is_empty()
        })
        .map(|reference| normalize_identifier(&reference.span_id))
}

fn map_jaeger_tags(tags: &[JaegerTag]) -> Map<String, Value> {
    let mut map = Map::new();
    for tag in tags {
        map.insert(tag.key.clone(), tag.value.clone());
    }
    if tag_is_truthy(tags, "error")
        || tag_string_value(tags, "status").is_some_and(|value| value == "error")
    {
        map.insert("outcome".to_string(), Value::String("error".to_string()));
    }
    map
}

fn tag_is_truthy(tags: &[JaegerTag], key: &str) -> bool {
    tags.iter()
        .find(|tag| tag.key == key)
        .and_then(|tag| match &tag.value {
            Value::Bool(value) => Some(*value),
            Value::String(value) => Some(matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "true" | "1" | "yes" | "y" | "on"
            )),
            Value::Number(value) => value.as_i64().map(|parsed| parsed != 0),
            _ => None,
        })
        .unwrap_or(false)
}

fn tag_string_value(tags: &[JaegerTag], key: &str) -> Option<String> {
    tags.iter()
        .find(|tag| tag.key == key)
        .and_then(|tag| otel_value_as_string(&tag.value))
}

fn dedupe_history_events(events: &mut Vec<FlowEvent>) {
    let mut seen = HashSet::new();
    events.retain(|event| {
        let key = format!(
            "{}:{}:{}:{}:{}",
            event.event_type,
            event.trace_id.clone().unwrap_or_default(),
            event.span_id.clone().unwrap_or_default(),
            event.timestamp,
            event.message.clone().unwrap_or_default(),
        );
        seen.insert(key)
    });
}

fn search_matches_event_map(
    search: Option<&str>,
    attributes: &Map<String, Value>,
    trace_id: Option<&str>,
) -> bool {
    let Some(search) = search.map(|value| value.trim().to_ascii_lowercase()) else {
        return true;
    };
    if search.is_empty() {
        return true;
    }
    if trace_id
        .map(|trace| trace.to_ascii_lowercase().contains(&search))
        .unwrap_or(false)
    {
        return true;
    }
    attributes.iter().any(|(key, value)| {
        key.to_ascii_lowercase().contains(&search)
            || otel_value_as_string(value)
                .map(|value| value.to_ascii_lowercase().contains(&search))
                .unwrap_or(false)
    })
}

fn search_matches_span(
    search: Option<&str>,
    trace_id: &str,
    span_id: &str,
    operation_name: &str,
    service_name: Option<&str>,
    attributes: &Map<String, Value>,
) -> bool {
    let Some(search) = search.map(|value| value.trim().to_ascii_lowercase()) else {
        return true;
    };
    if search.is_empty() {
        return true;
    }
    if trace_id.to_ascii_lowercase().contains(&search)
        || span_id.to_ascii_lowercase().contains(&search)
        || operation_name.to_ascii_lowercase().contains(&search)
        || service_name
            .map(|value| value.to_ascii_lowercase().contains(&search))
            .unwrap_or(false)
    {
        return true;
    }
    attributes.iter().any(|(key, value)| {
        key.to_ascii_lowercase().contains(&search)
            || otel_value_as_string(value)
                .map(|value| value.to_ascii_lowercase().contains(&search))
                .unwrap_or(false)
    })
}

fn object_string(object: &Map<String, Value>, key: &str) -> Option<String> {
    object.get(key).and_then(otel_value_as_string)
}

fn object_u64(object: &Map<String, Value>, key: &str) -> Option<u64> {
    object.get(key).and_then(otel_value_as_u64)
}

fn sort_events_for_timeline(events: &mut [FlowEvent]) {
    events.sort_by(|left, right| {
        let left_ms = parse_rfc3339_millis(&left.timestamp).unwrap_or(0);
        let right_ms = parse_rfc3339_millis(&right.timestamp).unwrap_or(0);
        left_ms
            .cmp(&right_ms)
            .then_with(|| {
                event_type_rank(&left.event_type).cmp(&event_type_rank(&right.event_type))
            })
            .then_with(|| {
                left.trace_id
                    .as_deref()
                    .unwrap_or_default()
                    .cmp(right.trace_id.as_deref().unwrap_or_default())
            })
            .then_with(|| {
                left.span_id
                    .as_deref()
                    .unwrap_or_default()
                    .cmp(right.span_id.as_deref().unwrap_or_default())
            })
    });
}

fn parse_rfc3339_millis(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.timestamp_millis())
}

fn event_type_rank(kind: &str) -> u8 {
    match kind {
        "span_start" => 0,
        "log" => 1,
        "span_end" => 2,
        _ => 3,
    }
}

fn assign_history_sequence_and_annotations(events: &mut [FlowEvent]) {
    for (index, event) in events.iter_mut().enumerate() {
        event.seq = Some((index + 1) as u64);
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
