mod common;

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

    let start_event = common::recv_flow_event(&mut socket).await;
    let end_event = common::recv_flow_event(&mut socket).await;

    assert_eq!(start_event.event_type, "span_start");
    assert!(start_event.seq.is_some());
    assert_eq!(start_event.event_kind.as_deref(), Some("node_started"));
    assert_eq!(start_event.node_key.as_deref(), Some("handle_mail_extract"));
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
