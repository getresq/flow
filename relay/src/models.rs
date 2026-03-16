use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub matched_flow_ids: Vec<String>,
}

impl FlowEvent {
    pub fn new(event_type: impl Into<String>, timestamp: String) -> Self {
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
            matched_flow_ids: Vec::new(),
        }
    }

    pub fn attr_string(&self, key: &str) -> Option<String> {
        self.attributes.get(key).and_then(otel_value_as_string)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsEnvelope {
    Snapshot { events: Vec<FlowEvent> },
    Batch { events: Vec<FlowEvent> },
}

#[derive(Debug, Serialize)]
pub struct IngestHealthResponse {
    pub status: &'static str,
    pub trace_count_total: u64,
    pub log_count_total: u64,
    pub trace_count_last_60s: usize,
    pub log_count_last_60s: usize,
    pub last_trace_at: Option<String>,
    pub last_log_at: Option<String>,
    pub traces_recent: bool,
    pub logs_recent: bool,
    pub recent_buffer_size: usize,
    pub ws_lagged_events_total: u64,
}

#[derive(Debug, Serialize)]
pub struct SupportedIngestPaths {
    pub traces_path: &'static str,
    pub logs_path: &'static str,
    pub ws_path: &'static str,
}

#[derive(Debug, Serialize)]
pub struct CapabilitiesResponse {
    pub service: &'static str,
    pub bind: String,
    pub supported_ingest: SupportedIngestPaths,
    pub recommended_mode: &'static str,
    pub supported_modes: [&'static str; 2],
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub from: Option<String>,
    pub to: Option<String>,
    pub window: Option<String>,
    pub query: Option<String>,
    pub limit: Option<usize>,
    pub flow_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    pub from: String,
    pub to: String,
    pub query: Option<String>,
    pub flow_id: Option<String>,
    pub events: Vec<FlowEvent>,
    pub log_count: usize,
    pub span_count: usize,
    pub truncated: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

pub fn annotate_flow_event(event: &mut FlowEvent, seq: &AtomicU64) {
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

pub fn assign_history_sequence_and_annotations(events: &mut [FlowEvent]) {
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

pub fn sort_events_for_timeline(events: &mut [FlowEvent]) {
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

pub fn infer_event_kind(event: &FlowEvent) -> String {
    match event.event_type.as_str() {
        "span_start" => "node_started".to_string(),
        "span_end" => "node_finished".to_string(),
        "log" => match event.attr_string("action").as_deref() {
            Some("enqueue") => "queue_enqueued".to_string(),
            Some("worker_pickup") => "queue_picked".to_string(),
            _ => "log_event".to_string(),
        },
        _ => "event".to_string(),
    }
}

pub fn infer_node_key(event: &FlowEvent) -> Option<String> {
    if let Some(component_id) = event.attr_string("component_id") {
        return Some(component_id);
    }

    let action = event.attr_string("action");
    let queue_name = event.attr_string("queue_name");
    let function_name = event.attr_string("function_name");
    let worker_name = event.attr_string("worker_name");
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

pub fn infer_error_state(event: &FlowEvent) -> bool {
    matches!(
        event.attr_string("status").as_deref(),
        Some("error" | "failed" | "STATUS_CODE_ERROR" | "2")
    ) || matches!(
        event.attr_string("outcome").as_deref(),
        Some("error" | "failed")
    ) || event.attr_string("error_type").is_some()
        || event.attr_string("error_message").is_some()
}

pub fn queue_delta_for_kind(kind: &str) -> Option<i64> {
    match kind {
        "queue_enqueued" => Some(1),
        "queue_picked" => Some(-1),
        _ => None,
    }
}

pub fn parse_attributes(attributes: Option<&Value>) -> Map<String, Value> {
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

pub fn parse_otel_any_value(raw: &Value) -> Value {
    let Some(obj) = raw.as_object() else {
        return raw.clone();
    };

    if let Some(string_value) = obj.get("stringValue").and_then(Value::as_str) {
        return Value::String(string_value.to_string());
    }
    if let Some(bool_value) = obj.get("boolValue").and_then(Value::as_bool) {
        return Value::Bool(bool_value);
    }
    if let Some(int_value) = obj.get("intValue")
        && let Some(parsed) = otel_value_as_i64(int_value)
    {
        return Value::Number(parsed.into());
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
        .and_then(|value| value.get("values"))
        .and_then(Value::as_array)
    {
        return Value::Array(array_values.iter().map(parse_otel_any_value).collect());
    }
    if let Some(kv_values) = obj
        .get("kvlistValue")
        .and_then(|value| value.get("values"))
        .and_then(Value::as_array)
    {
        let mut map = Map::new();
        for item in kv_values {
            let Some(key) = item.get("key").and_then(Value::as_str) else {
                continue;
            };
            let Some(value) = item.get("value") else {
                continue;
            };
            map.insert(key.to_string(), parse_otel_any_value(value));
        }
        return Value::Object(map);
    }

    raw.clone()
}

pub fn extract_service_name(resource_node: &Value) -> Option<String> {
    let attributes = resource_node
        .get("resource")
        .and_then(|resource| resource.get("attributes"));
    parse_attributes(attributes)
        .get("service.name")
        .and_then(otel_value_as_string)
}

pub fn string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(otel_value_as_string)
}

pub fn parse_nanos(value: Option<&Value>) -> Option<i128> {
    value.and_then(parse_nanos_from_value)
}

pub fn parse_nanos_from_value(value: &Value) -> Option<i128> {
    if let Some(number) = value.as_i64() {
        return Some(number as i128);
    }
    if let Some(number) = value.as_u64() {
        return Some(number as i128);
    }
    value.as_str().and_then(|raw| raw.parse::<i128>().ok())
}

pub fn otel_value_as_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number);
    }
    if let Some(number) = value.as_u64() {
        return i64::try_from(number).ok();
    }
    value.as_str().and_then(|raw| raw.parse::<i64>().ok())
}

pub fn otel_value_as_u64(value: &Value) -> Option<u64> {
    if let Some(number) = value.as_u64() {
        return Some(number);
    }
    if let Some(number) = value.as_i64() {
        return u64::try_from(number).ok();
    }
    if let Some(number) = value.as_f64()
        && number.is_finite()
        && number >= 0.0
    {
        return Some(number as u64);
    }
    value.as_str().and_then(|raw| raw.parse::<u64>().ok())
}

pub fn otel_value_as_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        Value::Null => None,
        _ => Some(value.to_string()),
    }
}

pub fn normalize_identifier(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().all(|char| char.is_ascii_hexdigit()) {
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

pub fn nanos_to_iso(nanos: i128) -> String {
    let seconds = nanos / 1_000_000_000;
    let nanos_part = nanos.rem_euclid(1_000_000_000) as u32;

    match DateTime::<Utc>::from_timestamp(seconds as i64, nanos_part) {
        Some(timestamp) => timestamp.to_rfc3339_opts(SecondsFormat::Millis, true),
        None => {
            tracing::warn!(
                nanos,
                seconds,
                nanos_part,
                "invalid OTLP timestamp, falling back to current time"
            );
            Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
        }
    }
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn event_type_rank(kind: &str) -> u8 {
    match kind {
        "span_start" => 0,
        "log" => 1,
        "span_end" => 2,
        _ => 3,
    }
}

fn parse_rfc3339_millis(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.timestamp_millis())
}
