mod common;

use serde_json::json;

#[tokio::test]
async fn keeps_parent_context_for_relevant_traces_and_tags_events() {
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
                  "spanId": "1111111111111111",
                  "name": "http.request",
                  "startTimeUnixNano": "1710000005000000000",
                  "endTimeUnixNano": "1710000005200000000"
                },
                {
                  "traceId": "0123456789abcdef0123456789abcdef",
                  "spanId": "2222222222222222",
                  "parentSpanId": "1111111111111111",
                  "name": "handle_mail_extract",
                  "startTimeUnixNano": "1710000005050000000",
                  "endTimeUnixNano": "1710000005150000000",
                  "attributes": [
                    { "key": "function_name", "value": { "stringValue": "handle_mail_extract" } }
                  ]
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
    assert_eq!(batch.len(), 4);
    assert_eq!(batch[0].span_name.as_deref(), Some("http.request"));
    assert_eq!(batch[0].matched_flow_ids, vec!["mail-pipeline"]);
    assert_eq!(batch[1].span_name.as_deref(), Some("http.request"));
    assert_eq!(batch[2].span_name.as_deref(), Some("handle_mail_extract"));
    assert_eq!(batch[2].matched_flow_ids, vec!["mail-pipeline"]);
    assert_eq!(batch[3].span_name.as_deref(), Some("handle_mail_extract"));

    server.shutdown();
}

#[tokio::test]
async fn drops_unrelated_trace_telemetry() {
    let server = common::spawn_server().await;
    let mut socket = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let payload = json!({
      "resourceSpans": [
        {
          "resource": {
            "attributes": [
              { "key": "service.name", "value": { "stringValue": "resq-agent" } }
            ]
          },
          "scopeSpans": [
            {
              "spans": [
                {
                  "traceId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  "spanId": "bbbbbbbbbbbbbbbb",
                  "name": "http.request",
                  "startTimeUnixNano": "1710000006000000000",
                  "endTimeUnixNano": "1710000006200000000"
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
    common::expect_no_message(&mut socket).await;

    server.shutdown();
}
