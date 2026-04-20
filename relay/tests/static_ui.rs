use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::net::TcpListener;

#[tokio::test]
async fn serves_static_ui_with_spa_fallback() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("listener addr");

    let ui_dir = std::env::temp_dir().join(format!(
        "resq-flow-ui-test-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
    ));
    fs::create_dir_all(ui_dir.join("assets")).expect("create ui dir");
    fs::write(
        ui_dir.join("index.html"),
        "<!doctype html><div id=\"root\"></div>",
    )
    .expect("write index");
    fs::write(ui_dir.join("assets/app.js"), "console.log('resq-flow')").expect("write asset");

    let contract_dir =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/contracts/default");
    let ui_dir_env = ui_dir.to_string_lossy().to_string();
    let app = temp_env::with_var("RESQ_FLOW_UI_DIR", Some(ui_dir_env), || {
        resq_flow_relay::build_app_with_contract_dir(addr.to_string(), contract_dir)
            .expect("build app")
    });

    let handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("test server failed");
    });

    let client = reqwest::Client::new();
    let root = client
        .get(format!("http://{addr}/"))
        .send()
        .await
        .expect("get root")
        .error_for_status()
        .expect("root ok")
        .text()
        .await
        .expect("root body");
    assert!(root.contains("<div id=\"root\"></div>"));

    let asset = client
        .get(format!("http://{addr}/assets/app.js"))
        .send()
        .await
        .expect("get asset")
        .error_for_status()
        .expect("asset ok")
        .text()
        .await
        .expect("asset body");
    assert_eq!(asset, "console.log('resq-flow')");

    let fallback = client
        .get(format!("http://{addr}/flows/mail-pipeline"))
        .send()
        .await
        .expect("get fallback")
        .error_for_status()
        .expect("fallback ok")
        .text()
        .await
        .expect("fallback body");
    assert!(fallback.contains("<div id=\"root\"></div>"));

    let api_miss = client
        .get(format!("http://{addr}/v1/typo"))
        .send()
        .await
        .expect("get api miss");
    assert_eq!(api_miss.status(), reqwest::StatusCode::NOT_FOUND);

    let flows = client
        .get(format!("http://{addr}/v1/flows"))
        .send()
        .await
        .expect("get flows")
        .error_for_status()
        .expect("flows ok")
        .json::<serde_json::Value>()
        .await
        .expect("flows json");
    assert!(flows["flows"].as_array().is_some());

    let asset_miss = client
        .get(format!("http://{addr}/assets/app-oldhash.js"))
        .send()
        .await
        .expect("get missing asset");
    assert_eq!(asset_miss.status(), reqwest::StatusCode::NOT_FOUND);

    let health_miss = client
        .get(format!("http://{addr}/health/typo"))
        .send()
        .await
        .expect("get health miss");
    assert_eq!(health_miss.status(), reqwest::StatusCode::NOT_FOUND);

    let capabilities_miss = client
        .get(format!("http://{addr}/capabilities/typo"))
        .send()
        .await
        .expect("get capabilities miss");
    assert_eq!(capabilities_miss.status(), reqwest::StatusCode::NOT_FOUND);

    let ws_miss = client
        .get(format!("http://{addr}/ws/typo"))
        .send()
        .await
        .expect("get ws miss");
    assert_eq!(ws_miss.status(), reqwest::StatusCode::NOT_FOUND);

    let health = client
        .get(format!("http://{addr}/health"))
        .send()
        .await
        .expect("get health")
        .error_for_status()
        .expect("health ok")
        .json::<serde_json::Value>()
        .await
        .expect("health json");
    assert_eq!(health["status"], "ok");

    handle.abort();
    let _ = fs::remove_dir_all(ui_dir);
}
