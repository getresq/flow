use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::common::v1::any_value::Value as AnyValueValue;
use opentelemetry_proto::tonic::common::v1::{AnyValue, KeyValue};
use opentelemetry_proto::tonic::logs::v1::{LogRecord, ResourceLogs, ScopeLogs};
use opentelemetry_proto::tonic::resource::v1::Resource;
use prost::Message as _;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;

type AnyError = Box<dyn std::error::Error + Send + Sync>;
type Result<T> = std::result::Result<T, AnyError>;

#[derive(Debug, Deserialize)]
struct IngestHealth {
    traces_recent: bool,
    logs_recent: bool,
    trace_count_last_60s: u64,
    log_count_last_60s: u64,
    last_trace_at: Option<String>,
    last_log_at: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let endpoint = std::env::var("OTLP_SMOKE_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4318/v1/logs".to_string());
    let expect_ingest_url = std::env::var("OTLP_SMOKE_EXPECT_INGEST_URL")
        .unwrap_or_else(|_| "http://localhost:4200/health/ingest".to_string());
    let service_name =
        std::env::var("OTLP_SMOKE_SERVICE_NAME").unwrap_or_else(|_| "resq-mail-worker".to_string());
    let wait_secs = std::env::var("OTLP_SMOKE_WAIT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(10);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;
    let before = fetch_ingest_health(&client, &expect_ingest_url).await?;
    let now = Utc::now();
    let trace_id = format!(
        "{:032x}",
        now.timestamp_nanos_opt().unwrap_or_default() as u128
    );
    let span_id = format!(
        "{:016x}",
        (now.timestamp_nanos_opt().unwrap_or_default() as u64) ^ 0xfeed_beef_dead_beef
    );
    let message = format!(
        "resq-flow smoke {}",
        now.to_rfc3339_opts(SecondsFormat::Millis, true)
    );

    let payload = ExportLogsServiceRequest {
        resource_logs: vec![ResourceLogs {
            resource: Some(Resource {
                attributes: vec![string_attribute("service.name", &service_name)],
                ..Default::default()
            }),
            scope_logs: vec![ScopeLogs {
                log_records: vec![LogRecord {
                    time_unix_nano: now.timestamp_nanos_opt().unwrap_or_default() as u64,
                    trace_id: hex::decode(trace_id.clone())?,
                    span_id: hex::decode(span_id.clone())?,
                    body: Some(string_any_value(&message)),
                    attributes: vec![
                        string_attribute("event", "mail_e2e_event"),
                        string_attribute("action", "enqueue"),
                        string_attribute("function_name", "handle_mail_extract"),
                        string_attribute("queue_name", "rrq:queue:mail-analyze"),
                        string_attribute("status", "ok"),
                        string_attribute("smoke_test", "true"),
                    ],
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }],
    };

    let response = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/x-protobuf")
        .body(payload.encode_to_vec())
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("smoke OTLP post failed: {status} {body}").into());
    }

    let after = wait_for_ingest(&client, &expect_ingest_url, &before, wait_secs).await?;

    println!("smoke post endpoint: {endpoint}");
    println!("relay ingest url: {expect_ingest_url}");
    println!("service.name: {service_name}");
    println!(
        "trace_count_last_60s: {} -> {}",
        before.trace_count_last_60s, after.trace_count_last_60s
    );
    println!(
        "log_count_last_60s: {} -> {}",
        before.log_count_last_60s, after.log_count_last_60s
    );
    println!(
        "last_trace_at: {} -> {}",
        before.last_trace_at.as_deref().unwrap_or("none"),
        after.last_trace_at.as_deref().unwrap_or("none")
    );
    println!(
        "last_log_at: {} -> {}",
        before.last_log_at.as_deref().unwrap_or("none"),
        after.last_log_at.as_deref().unwrap_or("none")
    );
    println!(
        "traces_recent: {}",
        if after.traces_recent { "yes" } else { "no" }
    );
    println!(
        "logs_recent: {}",
        if after.logs_recent { "yes" } else { "no" }
    );

    Ok(())
}

async fn wait_for_ingest(
    client: &reqwest::Client,
    ingest_url: &str,
    before: &IngestHealth,
    wait_secs: u64,
) -> Result<IngestHealth> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(wait_secs);
    loop {
        let current = fetch_ingest_health(client, ingest_url).await?;
        if current.log_count_last_60s > before.log_count_last_60s
            || current.last_log_at != before.last_log_at
        {
            return Ok(current);
        }

        if tokio::time::Instant::now() >= deadline {
            return Err(format!(
                "relay ingest did not change within {wait_secs}s (before count {}, last_log_at {:?})",
                before.log_count_last_60s, before.last_log_at
            )
            .into());
        }

        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

async fn fetch_ingest_health(client: &reqwest::Client, ingest_url: &str) -> Result<IngestHealth> {
    let response = client.get(ingest_url).send().await?;
    let response = response.error_for_status()?;
    Ok(response.json::<IngestHealth>().await?)
}

fn string_attribute(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.to_string(),
        value: Some(string_any_value(value)),
    }
}

fn string_any_value(value: &str) -> AnyValue {
    AnyValue {
        value: Some(AnyValueValue::StringValue(value.to_string())),
    }
}
