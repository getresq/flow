mod common;

use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use opentelemetry_proto::tonic::common::v1::any_value::Value as AnyValueValue;
use opentelemetry_proto::tonic::common::v1::{AnyValue, KeyValue};
use opentelemetry_proto::tonic::resource::v1::Resource;
use opentelemetry_proto::tonic::trace::v1::{ResourceSpans, ScopeSpans, Span};
use prost::Message as _;
use serde_json::json;

#[tokio::test]
async fn posts_otlp_traces_and_receives_span_events_over_websocket() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = json!({
      "resourceSpans": [
        {
          "resource": {
            "attributes": [
              { "key": "service.name", "value": { "stringValue": "resq-mail-worker" } }
            ]
          },
          "scopeSpans": [
            {
              "spans": [
                {
                  "traceId": "0123456789abcdef0123456789abcdef",
                  "spanId": "89abcdef01234567",
                  "parentSpanId": "fedcba9876543210",
                  "name": "rrq.enqueue",
                  "startTimeUnixNano": "1710000000000000000",
                  "endTimeUnixNano": "1710000000122000000",
                  "attributes": [
                    { "key": "flow_id", "value": { "stringValue": "mail-pipeline" } },
                    { "key": "run_id", "value": { "stringValue": "thread-123" } },
                    { "key": "component_id", "value": { "stringValue": "extract-worker" } },
                    { "key": "function_name", "value": { "stringValue": "handle_mail_extract" } },
                    { "key": "queue_name", "value": { "stringValue": "rrq:queue:mail-analyze" } },
                    { "key": "status", "value": { "stringValue": "ok" } }
                  ],
                  "status": { "code": "STATUS_CODE_OK" }
                }
              ]
            }
          ]
        }
      ]
    });

    let response = reqwest::Client::new()
        .post(format!("{}/v1/traces", server.http_base))
        .json(&payload)
        .send()
        .await
        .expect("post traces");

    assert!(response.status().is_success());

    let batch = common::recv_flow_events(&mut socket).await;
    assert_eq!(batch.len(), 2);
    let start_event = &batch[0];
    let end_event = &batch[1];

    assert_eq!(start_event.event_type, "span_start");
    assert!(start_event.seq.is_some());
    assert_eq!(start_event.event_kind.as_deref(), Some("node_started"));
    assert_eq!(start_event.node_key.as_deref(), Some("extract-worker"));
    assert_eq!(start_event.span_name.as_deref(), Some("rrq.enqueue"));
    assert_eq!(
        start_event.trace_id.as_deref(),
        Some("0123456789abcdef0123456789abcdef")
    );
    assert_eq!(start_event.span_id.as_deref(), Some("89abcdef01234567"));
    assert_eq!(
        start_event.parent_span_id.as_deref(),
        Some("fedcba9876543210")
    );
    assert_eq!(
        start_event
            .attributes
            .get("run_id")
            .and_then(|value| value.as_str()),
        Some("thread-123")
    );
    assert_eq!(
        start_event
            .attributes
            .get("component_id")
            .and_then(|value| value.as_str()),
        Some("extract-worker")
    );
    assert_eq!(start_event.matched_flow_ids, vec!["mail-pipeline"]);
    assert_eq!(
        start_event
            .attributes
            .get("function_name")
            .and_then(|value| value.as_str()),
        Some("handle_mail_extract")
    );

    assert_eq!(end_event.event_type, "span_end");
    assert!(end_event.seq.is_some());
    assert!(end_event.seq > start_event.seq);
    assert_eq!(end_event.event_kind.as_deref(), Some("node_finished"));
    assert_eq!(end_event.duration_ms, Some(122));
    assert_eq!(end_event.service_name.as_deref(), Some("resq-mail-worker"));

    server.shutdown();
}

#[tokio::test]
async fn posts_protobuf_otlp_traces_and_receives_span_events_over_websocket() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = ExportTraceServiceRequest {
        resource_spans: vec![ResourceSpans {
            resource: Some(Resource {
                attributes: vec![string_attribute("service.name", "resq-mail-worker")],
                ..Default::default()
            }),
            scope_spans: vec![ScopeSpans {
                spans: vec![Span {
                    trace_id: vec![
                        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67,
                        0x89, 0xab, 0xcd, 0xef,
                    ],
                    span_id: vec![0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67],
                    parent_span_id: vec![0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10],
                    name: "rrq.enqueue".to_string(),
                    start_time_unix_nano: 1_710_000_000_000_000_000,
                    end_time_unix_nano: 1_710_000_000_122_000_000,
                    attributes: vec![
                        string_attribute("flow_id", "mail-pipeline"),
                        string_attribute("run_id", "thread-123"),
                        string_attribute("component_id", "extract-worker"),
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
        .post(format!("{}/v1/traces", server.http_base))
        .header("content-type", "application/x-protobuf")
        .body(payload.encode_to_vec())
        .send()
        .await
        .expect("post protobuf traces");

    assert!(response.status().is_success());

    let batch = common::recv_flow_events(&mut socket).await;
    assert_eq!(batch.len(), 2);
    let start_event = &batch[0];
    let end_event = &batch[1];

    assert_eq!(start_event.event_type, "span_start");
    assert_eq!(start_event.node_key.as_deref(), Some("extract-worker"));
    assert_eq!(
        start_event.trace_id.as_deref(),
        Some("0123456789abcdef0123456789abcdef")
    );
    assert_eq!(
        start_event
            .attributes
            .get("run_id")
            .and_then(|value| value.as_str()),
        Some("thread-123")
    );
    assert_eq!(
        start_event
            .attributes
            .get("component_id")
            .and_then(|value| value.as_str()),
        Some("extract-worker")
    );
    assert_eq!(start_event.matched_flow_ids, vec!["mail-pipeline"]);
    assert_eq!(end_event.event_type, "span_end");
    assert_eq!(end_event.duration_ms, Some(122));
    assert_eq!(end_event.service_name.as_deref(), Some("resq-mail-worker"));

    server.shutdown();
}

fn string_attribute(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.to_string(),
        value: Some(AnyValue {
            value: Some(AnyValueValue::StringValue(value.to_string())),
        }),
    }
}
