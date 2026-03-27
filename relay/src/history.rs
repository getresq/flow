use std::collections::HashSet;
use std::time::Duration;

use axum::Json;
use axum::extract::{Query, RawQuery, State};
use axum::response::IntoResponse;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};

use crate::AppState;
use crate::error::{RelayError, RelayResult};
use crate::models::{
    FlowEvent, HistoryQuery, HistoryResponse, assign_history_sequence_and_annotations,
    nanos_to_iso, normalize_identifier, now_iso, otel_value_as_string, otel_value_as_u64,
    sort_events_for_timeline,
};

const DEFAULT_HISTORY_WINDOW_SECS: i64 = 30 * 60;
const MAX_HISTORY_WINDOW_SECS: i64 = 7 * 24 * 60 * 60;
const DEFAULT_HISTORY_LIMIT: usize = 8_000;
const MAX_HISTORY_LIMIT: usize = 20_000;
const DEFAULT_HISTORY_TIMEOUT_SECS: u64 = 8;

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
    processes: std::collections::HashMap<String, JaegerProcess>,
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

pub async fn get_history(
    State(state): State<AppState>,
    Query(query): Query<HistoryQuery>,
    RawQuery(raw_query): RawQuery,
) -> RelayResult<impl IntoResponse> {
    let (start, end) = resolve_history_range(&query)?;
    let attr_filters = parse_history_attr_filters(raw_query.as_deref())?;
    let search = query
        .query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let selected_flow_id = query
        .flow_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let logs_only = query.logs_only;
    let max_events = query
        .limit
        .unwrap_or(DEFAULT_HISTORY_LIMIT)
        .clamp(1, MAX_HISTORY_LIMIT);

    let client = state.history_client.clone();

    let log_query = state
        .matcher
        .registry()
        .history_log_query(
            selected_flow_id.as_deref(),
            search.as_deref(),
            &attr_filters,
        );

    let log_future = async {
        let Some(log_query) = log_query.as_deref() else {
            return Ok(Vec::new());
        };
        fetch_history_logs(
            &client,
            start,
            end,
            log_query,
            search.as_deref(),
            &attr_filters,
            max_events,
        )
        .await
    };

    let span_future = async {
        if logs_only {
            Ok(Vec::new())
        } else {
            fetch_history_spans(&client, start, end, search.as_deref(), max_events).await
        }
    };

    let (log_result, span_result) = tokio::join!(log_future, span_future);

    let mut warnings = Vec::new();
    let mut events = Vec::new();

    match log_result {
        Ok(mut log_events) => events.append(&mut log_events),
        Err(error) => warnings.push(format!("logs unavailable: {error}")),
    }

    match span_result {
        Ok(mut span_events) => events.append(&mut span_events),
        Err(error) => warnings.push(format!("traces unavailable: {error}")),
    }

    let mut events = state
        .matcher
        .filter_history_events(events, selected_flow_id.as_deref());
    sort_events_for_timeline(&mut events);
    assign_history_sequence_and_annotations(&mut events);

    let log_count = events
        .iter()
        .filter(|event| event.event_type == "log")
        .count();
    let span_count = events
        .iter()
        .filter(|event| event.event_type == "span_start" || event.event_type == "span_end")
        .count();

    let truncated = events.len() > max_events;
    if truncated {
        let start_index = events.len().saturating_sub(max_events);
        events = events.split_off(start_index);
        assign_history_sequence_and_annotations(&mut events);
    }

    if events.is_empty() && warnings.is_empty() {
        warnings.push("no events found in requested time window".to_string());
    }

    Ok((
        axum::http::StatusCode::OK,
        Json(HistoryResponse {
            from: start.to_rfc3339_opts(SecondsFormat::Millis, true),
            to: end.to_rfc3339_opts(SecondsFormat::Millis, true),
            query: search,
            flow_id: selected_flow_id,
            events,
            log_count,
            span_count,
            truncated,
            warnings,
        }),
    ))
}

pub(crate) fn build_history_client() -> RelayResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(history_timeout_secs()))
        .build()
        .map_err(|error| RelayError::internal(format!("failed to build history client: {error}")))
}

fn resolve_history_range(query: &HistoryQuery) -> RelayResult<(DateTime<Utc>, DateTime<Utc>)> {
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
        return Err(RelayError::bad_request(
            "history range is invalid: from must be before to",
        ));
    }

    Ok((start, end))
}

fn parse_rfc3339_utc(raw: &str) -> RelayResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|error| RelayError::bad_request(format!("invalid datetime `{raw}`: {error}")))
}

fn parse_window_secs(raw: &str) -> RelayResult<i64> {
    let value = raw.trim().to_lowercase();
    if value.is_empty() {
        return Err(RelayError::bad_request("window cannot be empty"));
    }

    let split_at = value
        .find(|char: char| !char.is_ascii_digit())
        .unwrap_or(value.len());
    let (digits, unit) = value.split_at(split_at);
    if digits.is_empty() {
        return Err(RelayError::bad_request(format!("invalid window `{raw}`")));
    }

    let amount = digits
        .parse::<i64>()
        .map_err(|_| RelayError::bad_request(format!("invalid window amount `{raw}`")))?;
    if amount <= 0 {
        return Err(RelayError::bad_request(format!(
            "window must be positive: `{raw}`"
        )));
    }

    let multiplier = match unit {
        "" | "s" => 1,
        "m" => 60,
        "h" => 60 * 60,
        "d" => 24 * 60 * 60,
        _ => {
            return Err(RelayError::bad_request(format!(
                "unsupported window unit in `{raw}`"
            )));
        }
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
    let values = raw
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect::<HashSet<_>>();
    if values.is_empty() {
        return None;
    }
    Some(values)
}

async fn fetch_history_logs(
    client: &reqwest::Client,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    query: &str,
    search: Option<&str>,
    attr_filters: &[(String, String)],
    limit: usize,
) -> Result<Vec<FlowEvent>, String> {
    let response = client
        .get(vlogs_query_url())
        .query(&[
            ("query", query.to_string()),
            ("limit", limit.to_string()),
            ("start", start.timestamp().to_string()),
            ("end", end.timestamp().to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("history logs request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("history logs endpoint returned error: {error}"))?;

    let body = response
        .text()
        .await
        .map_err(|error| format!("history logs body read failed: {error}"))?;

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
        if !matches_attribute_filters_in_event_map(attr_filters, &event.attributes) {
            continue;
        }
        events.push(event);
    }

    Ok(events)
}

fn map_logsql_line_to_flow_event(value: &Value) -> Option<FlowEvent> {
    let object = value.as_object()?;
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
    event.attributes = filtered_logsql_attributes(object);
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

    let mut tasks = tokio::task::JoinSet::new();
    for service in services {
        let client = client.clone();
        let base = base.clone();
        let service_name = service.clone();
        tasks.spawn(async move {
            let result = fetch_traces_for_service(
                &client,
                &base,
                &service_name,
                start,
                end,
                per_service_limit,
            )
            .await;
            (service_name, result)
        });
    }

    while let Some(joined) = tasks.join_next().await {
        match joined {
            Ok((_service, Ok(traces))) => {
                successful_queries += 1;
                for trace in traces {
                    map_jaeger_trace_to_flow_events(&trace, search, &mut events);
                }
            }
            Ok((service, Err(error))) => {
                failed_queries += 1;
                tracing::debug!(%service, error = %error, "history trace query failed");
            }
            Err(error) => {
                failed_queries += 1;
                tracing::debug!(error = ?error, "history trace query task failed");
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
    base_url: &str,
) -> Result<Vec<String>, String> {
    let url = format!(
        "{}/select/jaeger/api/services",
        base_url.trim_end_matches('/')
    );
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("history traces services request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("history traces services endpoint returned error: {error}"))?;

    response
        .json::<JaegerServicesResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|error| format!("history traces services parse failed: {error}"))
}

async fn fetch_traces_for_service(
    client: &reqwest::Client,
    base_url: &str,
    service: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    limit: usize,
) -> Result<Vec<JaegerTrace>, String> {
    let url = format!(
        "{}/select/jaeger/api/traces",
        base_url.trim_end_matches('/')
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
        .map_err(|error| format!("history traces request failed for `{service}`: {error}`"))?
        .error_for_status()
        .map_err(|error| {
            format!("history traces endpoint returned error for `{service}`: {error}`")
        })?;

    response
        .json::<JaegerTracesResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|error| format!("history traces parse failed for `{service}`: {error}"))
}

fn filtered_logsql_attributes(object: &Map<String, Value>) -> Map<String, Value> {
    object
        .iter()
        .filter(|(key, _)| !matches!(key.as_str(), "_stream" | "_stream_id"))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
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

fn parse_history_attr_filters(raw_query: Option<&str>) -> RelayResult<Vec<(String, String)>> {
    let Some(raw_query) = raw_query else {
        return Ok(Vec::new());
    };

    url::form_urlencoded::parse(raw_query.as_bytes())
        .filter_map(|(key, value)| (key == "attr").then(|| value.into_owned()))
        .map(|value| parse_history_attr_filter(&value))
        .collect()
}

fn parse_history_attr_filter(raw: &str) -> RelayResult<(String, String)> {
    let Some((key, value)) = raw.split_once('=') else {
        return Err(RelayError::bad_request(format!(
            "invalid attr filter `{raw}`: expected key=value"
        )));
    };

    let key = key.trim();
    let value = value.trim();
    if key.is_empty() || value.is_empty() {
        return Err(RelayError::bad_request(format!(
            "invalid attr filter `{raw}`: expected key=value"
        )));
    }

    if !key
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '_' | '-' | '.'))
    {
        return Err(RelayError::bad_request(format!(
            "invalid attr key `{key}`: only letters, numbers, _, -, and . are supported"
        )));
    }

    Ok((key.to_string(), value.to_string()))
}

fn matches_attribute_filters_in_event_map(
    filters: &[(String, String)],
    attributes: &Map<String, Value>,
) -> bool {
    filters.iter().all(|(key, expected)| {
        attributes
            .get(key)
            .and_then(otel_value_as_string)
            .map(|value| value == *expected)
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
