mod common;

use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::common::v1::any_value::Value as AnyValueValue;
use opentelemetry_proto::tonic::common::v1::{AnyValue, KeyValue};
use opentelemetry_proto::tonic::logs::v1::{LogRecord, ResourceLogs, ScopeLogs};
use opentelemetry_proto::tonic::resource::v1::Resource;
use prost::Message as _;
use serde_json::json;

#[tokio::test]
async fn posts_flow_event_logs_and_receives_log_event() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = json!({
      "resourceLogs": [
        {
          "resource": {
            "attributes": [
              { "key": "service.name", "value": { "stringValue": "resq-mail-worker" } }
            ]
          },
          "scopeLogs": [
            {
              "logRecords": [
                {
                  "timeUnixNano": "1710000001000000000",
                  "traceId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  "spanId": "bbbbbbbbbbbbbbbb",
                  "body": { "stringValue": "mail event" },
                  "attributes": [
                    { "key": "event", "value": { "stringValue": "flow_event" } },
                    { "key": "flow_id", "value": { "stringValue": "mail-pipeline" } },
                    { "key": "run_id", "value": { "stringValue": "thread-123" } },
                    { "key": "component_id", "value": { "stringValue": "analyze-queue" } },
                    { "key": "action", "value": { "stringValue": "enqueue" } },
                    { "key": "function_name", "value": { "stringValue": "handle_mail_extract" } },
                    { "key": "queue_name", "value": { "stringValue": "rrq:queue:mail-analyze" } },
                    { "key": "status", "value": { "stringValue": "ok" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    let response = reqwest::Client::new()
        .post(format!("{}/v1/logs", server.http_base))
        .json(&payload)
        .send()
        .await
        .expect("post logs");

    assert!(response.status().is_success());

    let batch = common::recv_flow_events(&mut socket).await;
    assert_eq!(batch.len(), 1);
    let event = &batch[0];
    assert_eq!(event.event_type, "log");
    assert!(event.seq.is_some());
    assert_eq!(event.event_kind.as_deref(), Some("queue_enqueued"));
    assert_eq!(event.queue_delta, Some(1));
    assert_eq!(event.node_key.as_deref(), Some("analyze-queue"));
    assert_eq!(event.span_name.as_deref(), Some("handle_mail_extract"));
    assert_eq!(event.service_name.as_deref(), Some("resq-mail-worker"));
    assert_eq!(event.message.as_deref(), Some("mail event"));
    assert_eq!(event.matched_flow_ids, vec!["mail-pipeline"]);
    assert_eq!(
        event
            .attributes
            .get("run_id")
            .and_then(|value| value.as_str()),
        Some("thread-123")
    );
    assert_eq!(
        event
            .attributes
            .get("component_id")
            .and_then(|value| value.as_str()),
        Some("analyze-queue")
    );
    assert_eq!(
        event
            .attributes
            .get("action")
            .and_then(|value| value.as_str()),
        Some("enqueue")
    );
    assert_eq!(
        event
            .attributes
            .get("queue_name")
            .and_then(|value| value.as_str()),
        Some("rrq:queue:mail-analyze")
    );

    server.shutdown();
}

#[tokio::test]
async fn filters_non_flow_event_logs() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = json!({
      "resourceLogs": [
        {
          "scopeLogs": [
            {
              "logRecords": [
                {
                  "timeUnixNano": "1710000001000000000",
                  "attributes": [
                    { "key": "event", "value": { "stringValue": "http_request" } },
                    { "key": "message", "value": { "stringValue": "ignore me" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    let response = reqwest::Client::new()
        .post(format!("{}/v1/logs", server.http_base))
        .json(&payload)
        .send()
        .await
        .expect("post logs");

    assert!(response.status().is_success());

    common::expect_no_message(&mut socket).await;

    server.shutdown();
}

#[tokio::test]
async fn drops_logs_with_unknown_explicit_flow_id() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = json!({
      "resourceLogs": [
        {
          "resource": {
            "attributes": [
              { "key": "service.name", "value": { "stringValue": "resq-mail-worker" } }
            ]
          },
          "scopeLogs": [
            {
              "logRecords": [
                {
                  "timeUnixNano": "1710000001000000000",
                  "traceId": "cccccccccccccccccccccccccccccccc",
                  "spanId": "dddddddddddddddd",
                  "body": { "stringValue": "mail event" },
                  "attributes": [
                    { "key": "event", "value": { "stringValue": "flow_event" } },
                    { "key": "flow_id", "value": { "stringValue": "unknown-flow" } },
                    { "key": "component_id", "value": { "stringValue": "analyze-queue" } },
                    { "key": "action", "value": { "stringValue": "enqueue" } },
                    { "key": "status", "value": { "stringValue": "ok" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    let response = reqwest::Client::new()
        .post(format!("{}/v1/logs", server.http_base))
        .json(&payload)
        .send()
        .await
        .expect("post logs");

    assert!(response.status().is_success());
    common::expect_no_message(&mut socket).await;

    server.shutdown();
}

#[tokio::test]
async fn posts_protobuf_flow_event_logs_and_receives_log_event() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = ExportLogsServiceRequest {
        resource_logs: vec![ResourceLogs {
            resource: Some(Resource {
                attributes: vec![string_attribute("service.name", "resq-mail-worker")],
                ..Default::default()
            }),
            scope_logs: vec![ScopeLogs {
                log_records: vec![LogRecord {
                    time_unix_nano: 1_710_000_001_000_000_000,
                    trace_id: vec![
                        0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa,
                        0xaa, 0xaa, 0xaa, 0xaa,
                    ],
                    span_id: vec![0xbb, 0xbb, 0xbb, 0xbb, 0xbb, 0xbb, 0xbb, 0xbb],
                    body: Some(string_any_value("mail event")),
                    attributes: vec![
                        string_attribute("event", "flow_event"),
                        string_attribute("flow_id", "mail-pipeline"),
                        string_attribute("run_id", "thread-123"),
                        string_attribute("component_id", "analyze-queue"),
                        string_attribute("action", "enqueue"),
                        string_attribute("function_name", "handle_mail_extract"),
                        string_attribute("queue_name", "rrq:queue:mail-analyze"),
                        string_attribute("status", "ok"),
                    ],
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }],
    };

    let response = reqwest::Client::new()
        .post(format!("{}/v1/logs", server.http_base))
        .header("content-type", "application/x-protobuf")
        .body(payload.encode_to_vec())
        .send()
        .await
        .expect("post protobuf logs");

    assert!(response.status().is_success());

    let batch = common::recv_flow_events(&mut socket).await;
    assert_eq!(batch.len(), 1);
    let event = &batch[0];
    assert_eq!(event.event_type, "log");
    assert_eq!(event.event_kind.as_deref(), Some("queue_enqueued"));
    assert_eq!(event.queue_delta, Some(1));
    assert_eq!(event.node_key.as_deref(), Some("analyze-queue"));
    assert_eq!(event.span_name.as_deref(), Some("handle_mail_extract"));
    assert_eq!(event.service_name.as_deref(), Some("resq-mail-worker"));
    assert_eq!(event.message.as_deref(), Some("mail event"));
    assert_eq!(event.matched_flow_ids, vec!["mail-pipeline"]);
    assert_eq!(
        event
            .attributes
            .get("run_id")
            .and_then(|value| value.as_str()),
        Some("thread-123")
    );
    assert_eq!(
        event
            .attributes
            .get("component_id")
            .and_then(|value| value.as_str()),
        Some("analyze-queue")
    );

    server.shutdown();
}

#[tokio::test]
async fn falls_back_to_observed_time_when_log_time_is_zero() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = json!({
      "resourceLogs": [
        {
          "scopeLogs": [
            {
              "logRecords": [
                {
                  "timeUnixNano": "0",
                  "observedTimeUnixNano": "1710000001000000000",
                  "body": { "stringValue": "mail event" },
                  "attributes": [
                    { "key": "event", "value": { "stringValue": "flow_event" } },
                    { "key": "flow_id", "value": { "stringValue": "mail-pipeline" } },
                    { "key": "run_id", "value": { "stringValue": "thread-123" } },
                    { "key": "component_id", "value": { "stringValue": "analyze-queue" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    let response = reqwest::Client::new()
        .post(format!("{}/v1/logs", server.http_base))
        .json(&payload)
        .send()
        .await
        .expect("post logs");

    assert!(response.status().is_success());

    let batch = common::recv_flow_events(&mut socket).await;
    assert_eq!(batch.len(), 1);
    let event = &batch[0];
    assert_eq!(event.event_type, "log");
    assert_eq!(event.timestamp, "2024-03-09T16:00:01.000Z");

    server.shutdown();
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
