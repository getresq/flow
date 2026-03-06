mod common;

use serde_json::json;

#[tokio::test]
async fn reports_ingest_activity_after_trace_and_log_posts() {
    let server = common::spawn_server().await;
    let client = reqwest::Client::new();

    let initial = client
        .get(format!("{}/health/ingest", server.http_base))
        .send()
        .await
        .expect("get initial ingest health")
        .error_for_status()
        .expect("initial ingest health ok")
        .json::<serde_json::Value>()
        .await
        .expect("initial ingest json");

    assert_eq!(initial["status"], "ok");
    assert_eq!(initial["trace_count_total"], 0);
    assert_eq!(initial["log_count_total"], 0);
    assert_eq!(initial["traces_recent"], false);
    assert_eq!(initial["logs_recent"], false);
    assert!(initial["last_trace_at"].is_null());
    assert!(initial["last_log_at"].is_null());

    let trace_payload = json!({
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
                  "name": "rrq.enqueue",
                  "startTimeUnixNano": "1710000000000000000",
                  "endTimeUnixNano": "1710000000122000000",
                  "attributes": [
                    { "key": "function_name", "value": { "stringValue": "handle_mail_extract" } }
                  ],
                  "status": { "code": "STATUS_CODE_OK" }
                }
              ]
            }
          ]
        }
      ]
    });

    client
        .post(format!("{}/v1/traces", server.http_base))
        .json(&trace_payload)
        .send()
        .await
        .expect("post traces")
        .error_for_status()
        .expect("trace post ok");

    let after_trace = client
        .get(format!("{}/health/ingest", server.http_base))
        .send()
        .await
        .expect("get after trace")
        .error_for_status()
        .expect("after trace ok")
        .json::<serde_json::Value>()
        .await
        .expect("after trace json");

    assert_eq!(after_trace["traces_recent"], true);
    assert_eq!(after_trace["logs_recent"], false);
    assert!(
        after_trace["trace_count_total"]
            .as_u64()
            .unwrap_or_default()
            > 0
    );
    assert!(
        after_trace["trace_count_last_60s"]
            .as_u64()
            .unwrap_or_default()
            > 0
    );
    assert!(after_trace["last_trace_at"].as_str().is_some());

    let log_payload = json!({
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
                    { "key": "queue_name", "value": { "stringValue": "rrq:queue:mail-analyze" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    client
        .post(format!("{}/v1/logs", server.http_base))
        .json(&log_payload)
        .send()
        .await
        .expect("post logs")
        .error_for_status()
        .expect("log post ok");

    let after_log = client
        .get(format!("{}/health/ingest", server.http_base))
        .send()
        .await
        .expect("get after log")
        .error_for_status()
        .expect("after log ok")
        .json::<serde_json::Value>()
        .await
        .expect("after log json");

    assert_eq!(after_log["traces_recent"], true);
    assert_eq!(after_log["logs_recent"], true);
    assert!(after_log["log_count_total"].as_u64().unwrap_or_default() > 0);
    assert!(after_log["log_count_last_60s"].as_u64().unwrap_or_default() > 0);
    assert!(after_log["last_log_at"].as_str().is_some());

    server.shutdown();
}
