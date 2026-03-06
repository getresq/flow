use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::http::header::CONTENT_TYPE;
use axum::response::IntoResponse;
use chrono::Utc;
use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use prost::Message as _;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::{RelayError, RelayResult};
use crate::models::{
    FlowEvent, extract_service_name, nanos_to_iso, normalize_identifier, now_iso,
    otel_value_as_string, otel_value_as_u64, parse_attributes, parse_nanos, parse_nanos_from_value,
    string_field,
};

pub async fn post_traces(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> RelayResult<impl IntoResponse> {
    let decoded = decode_trace_events(&headers, &body)?;
    let kept = state.matcher.filter_live_events(decoded).await;
    let count = state.hub.publish(kept).await;
    if count > 0 {
        state.ingest.record_traces(count, Utc::now()).await;
    }
    Ok((
        axum::http::StatusCode::OK,
        Json(json!({ "received": count })),
    ))
}

pub async fn post_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> RelayResult<impl IntoResponse> {
    let decoded = decode_log_events(&headers, &body)?;
    let kept = state.matcher.filter_live_events(decoded).await;
    let count = state.hub.publish(kept).await;
    if count > 0 {
        state.ingest.record_logs(count, Utc::now()).await;
    }
    Ok((
        axum::http::StatusCode::OK,
        Json(json!({ "received": count })),
    ))
}

#[derive(Clone, Copy)]
enum OtlpPayloadFormat {
    Json,
    Protobuf,
}

fn decode_trace_events(headers: &HeaderMap, body: &Bytes) -> RelayResult<Vec<FlowEvent>> {
    match detect_payload_format(headers, body)? {
        OtlpPayloadFormat::Json => {
            let payload = decode_json_payload(body)?;
            Ok(parse_trace_events(&payload))
        }
        OtlpPayloadFormat::Protobuf => {
            let request = ExportTraceServiceRequest::decode(body.as_ref()).map_err(|error| {
                RelayError::bad_request(format!("invalid OTLP protobuf trace payload: {error}"))
            })?;
            let payload = serde_json::to_value(request).map_err(|error| {
                RelayError::internal(format!(
                    "failed to serialize OTLP protobuf trace payload: {error}"
                ))
            })?;
            Ok(parse_trace_events(&payload))
        }
    }
}

fn decode_log_events(headers: &HeaderMap, body: &Bytes) -> RelayResult<Vec<FlowEvent>> {
    match detect_payload_format(headers, body)? {
        OtlpPayloadFormat::Json => {
            let payload = decode_json_payload(body)?;
            Ok(parse_log_events(&payload))
        }
        OtlpPayloadFormat::Protobuf => {
            let request = ExportLogsServiceRequest::decode(body.as_ref()).map_err(|error| {
                RelayError::bad_request(format!("invalid OTLP protobuf log payload: {error}"))
            })?;
            let payload = serde_json::to_value(request).map_err(|error| {
                RelayError::internal(format!(
                    "failed to serialize OTLP protobuf log payload: {error}"
                ))
            })?;
            Ok(parse_log_events(&payload))
        }
    }
}

fn detect_payload_format(headers: &HeaderMap, body: &Bytes) -> RelayResult<OtlpPayloadFormat> {
    let content_type = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(content_type) = content_type {
        let normalized = content_type.to_ascii_lowercase();
        if normalized.contains("json") {
            return Ok(OtlpPayloadFormat::Json);
        }
        if normalized.contains("protobuf") || normalized.contains("octet-stream") {
            return Ok(OtlpPayloadFormat::Protobuf);
        }
        return Err(RelayError::unsupported_media_type(format!(
            "unsupported content type: {content_type}"
        )));
    }

    if body
        .iter()
        .copied()
        .find(|byte| !byte.is_ascii_whitespace())
        .is_some_and(|byte| matches!(byte, b'{' | b'['))
    {
        Ok(OtlpPayloadFormat::Json)
    } else {
        Ok(OtlpPayloadFormat::Protobuf)
    }
}

fn decode_json_payload(body: &Bytes) -> RelayResult<Value> {
    serde_json::from_slice(body)
        .map_err(|error| RelayError::bad_request(format!("invalid OTLP JSON payload: {error}")))
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
                let trace_id =
                    string_field(span, "traceId").map(|value| normalize_identifier(&value));
                let span_id =
                    string_field(span, "spanId").map(|value| normalize_identifier(&value));
                let parent_span_id = string_field(span, "parentSpanId")
                    .filter(|value| !value.is_empty())
                    .map(|value| normalize_identifier(&value));

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
                let timestamp = parse_nanos(log_record.get("timeUnixNano"))
                    .map(nanos_to_iso)
                    .or_else(|| {
                        parse_nanos(log_record.get("observedTimeUnixNano")).map(nanos_to_iso)
                    })
                    .unwrap_or_else(now_iso);
                let trace_id =
                    string_field(log_record, "traceId").map(|value| normalize_identifier(&value));
                let span_id =
                    string_field(log_record, "spanId").map(|value| normalize_identifier(&value));

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
                            (Some(start), Some(end)) if end >= start => {
                                Some(((end - start) / 1_000_000) as u64)
                            }
                            _ => None,
                        }
                    });
                event.message = log_record
                    .get("body")
                    .map(crate::models::parse_otel_any_value)
                    .and_then(|value| otel_value_as_string(&value))
                    .or_else(|| attributes.get("message").and_then(otel_value_as_string));
                event.attributes = attributes;
                events.push(event);
            }
        }
    }

    events
}
