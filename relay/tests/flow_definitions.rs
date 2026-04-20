use std::fs;

use tokio::net::TcpListener;

#[tokio::test]
async fn serves_flow_definitions_from_config_dir() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("listener addr");

    let config_dir =
        std::env::temp_dir().join(format!("resq-flow-definitions-test-{}", std::process::id(),));
    fs::create_dir_all(&config_dir).expect("create config dir");
    fs::write(
        config_dir.join("example.json"),
        r#"{"id":"example","name":"Example","contract":{"version":1,"id":"example","name":"Example","telemetry":{"log_events":[],"queue_prefixes":[],"function_prefixes":[],"worker_prefixes":[],"step_prefixes":[]},"keep_context":{"parent_spans":true,"root_spans":true,"error_events":true,"unmapped_events_for_kept_traces":true}},"hasGraph":false,"nodes":[],"edges":[],"spanMapping":{}}"#,
    )
    .expect("write flow definition");

    let contract_dir =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/contracts/default");
    let app = resq_flow_relay::build_app_with_contract_dir_and_flow_definition_dir(
        addr.to_string(),
        contract_dir,
        &config_dir,
    )
    .expect("build app");

    let handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("test server failed");
    });

    let payload = reqwest::Client::new()
        .get(format!("http://{addr}/v1/flows"))
        .send()
        .await
        .expect("get flows")
        .error_for_status()
        .expect("flows ok")
        .json::<serde_json::Value>()
        .await
        .expect("flows json");

    assert_eq!(payload["flows"][0]["id"], "example");

    handle.abort();
    let _ = fs::remove_dir_all(config_dir);
}
