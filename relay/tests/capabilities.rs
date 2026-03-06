mod common;

#[tokio::test]
async fn reports_supported_paths_and_modes() {
    let server = common::spawn_server().await;

    let payload = reqwest::Client::new()
        .get(format!("{}/capabilities", server.http_base))
        .send()
        .await
        .expect("get capabilities")
        .error_for_status()
        .expect("capabilities ok")
        .json::<serde_json::Value>()
        .await
        .expect("capabilities json");

    assert_eq!(payload["service"], "resq-flow-relay");
    assert_eq!(
        payload["bind"],
        server.http_base.trim_start_matches("http://")
    );
    assert_eq!(payload["supported_ingest"]["traces_path"], "/v1/traces");
    assert_eq!(payload["supported_ingest"]["logs_path"], "/v1/logs");
    assert_eq!(payload["supported_ingest"]["ws_path"], "/ws");
    assert_eq!(payload["recommended_mode"], "collector-compatible");
    assert_eq!(
        payload["supported_modes"],
        serde_json::json!(["collector-compatible", "direct"])
    );

    server.shutdown();
}
