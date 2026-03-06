mod common;

use serde_json::json;

fn trace_payload(span_id: &str, timestamp_nanos: &str) -> serde_json::Value {
    json!({
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
                  "spanId": span_id,
                  "name": "rrq.enqueue",
                  "startTimeUnixNano": timestamp_nanos,
                  "endTimeUnixNano": (timestamp_nanos.parse::<u128>().expect("timestamp") + 10_000_000).to_string(),
                  "attributes": [
                    { "key": "event", "value": { "stringValue": "mail_e2e_event" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })
}

#[tokio::test]
async fn broadcasts_to_multiple_clients_and_survives_disconnect() {
    let server = common::spawn_server().await;

    let mut client_a = common::connect_ws(&format!("{}/ws", server.ws_base)).await;
    let mut client_b = common::connect_ws(&format!("{}/ws", server.ws_base)).await;

    let post_first = reqwest::Client::new()
        .post(format!("{}/v1/traces", server.http_base))
        .json(&trace_payload("1111111111111111", "1710000002000000000"))
        .send()
        .await
        .expect("post traces");
    assert!(post_first.status().is_success());

    let a_batch = common::recv_flow_events(&mut client_a).await;
    let b_batch = common::recv_flow_events(&mut client_b).await;
    assert_eq!(a_batch.len(), 2);
    assert_eq!(b_batch.len(), 2);
    let a_first = &a_batch[0];
    let b_first = &b_batch[0];
    assert_eq!(a_first.event_type, "span_start");
    assert_eq!(b_first.event_type, "span_start");

    drop(client_a);

    let post_second = reqwest::Client::new()
        .post(format!("{}/v1/traces", server.http_base))
        .json(&trace_payload("2222222222222222", "1710000003000000000"))
        .send()
        .await
        .expect("post traces");
    assert!(post_second.status().is_success());

    let second_batch = common::recv_flow_events(&mut client_b).await;
    assert_eq!(second_batch.len(), 2);
    let second_event = &second_batch[0];
    assert_eq!(second_event.event_type, "span_start");
    assert_eq!(second_event.span_id.as_deref(), Some("2222222222222222"));

    server.shutdown();
}

#[tokio::test]
async fn sends_recent_snapshot_to_new_clients() {
    let server = common::spawn_server().await;

    let response = reqwest::Client::new()
        .post(format!("{}/v1/traces", server.http_base))
        .json(&trace_payload("3333333333333333", "1710000004000000000"))
        .send()
        .await
        .expect("post traces");
    assert!(response.status().is_success());

    let mut client = common::connect_ws(&format!("{}/ws", server.ws_base)).await;
    let snapshot = common::recv_flow_events(&mut client).await;
    assert_eq!(snapshot.len(), 2);
    assert_eq!(snapshot[0].event_type, "span_start");
    assert_eq!(snapshot[0].span_id.as_deref(), Some("3333333333333333"));
    assert_eq!(snapshot[0].matched_flow_ids, vec!["mail-pipeline"]);

    server.shutdown();
}
