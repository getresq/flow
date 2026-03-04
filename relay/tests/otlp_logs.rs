mod common;

use serde_json::json;

#[tokio::test]
async fn posts_mail_e2e_logs_and_receives_log_event() {
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
                    { "key": "event", "value": { "stringValue": "mail_e2e_event" } },
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

    let event = common::recv_flow_event(&mut socket).await;
    assert_eq!(event.event_type, "log");
    assert!(event.seq.is_some());
    assert_eq!(event.event_kind.as_deref(), Some("queue_enqueued"));
    assert_eq!(event.queue_delta, Some(1));
    assert_eq!(event.node_key.as_deref(), Some("rrq:queue:mail-analyze"));
    assert_eq!(event.span_name.as_deref(), Some("handle_mail_extract"));
    assert_eq!(event.service_name.as_deref(), Some("resq-mail-worker"));
    assert_eq!(event.message.as_deref(), Some("mail event"));
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
async fn filters_non_mail_e2e_logs() {
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
