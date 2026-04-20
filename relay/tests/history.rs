mod common;

use std::collections::BTreeSet;
use std::sync::Arc;

use axum::Router;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::routing::get;
use serde::Deserialize;
use serde_json::json;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use resq_flow_relay::FlowEvent;

struct MockVlogsServer {
    base_url: String,
    handle: JoinHandle<()>,
}

impl MockVlogsServer {
    fn shutdown(self) {
        self.handle.abort();
    }
}

#[derive(Clone)]
struct MockVlogsState {
    rows: Arc<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct MockVlogsQuery {
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct HistoryResponseBody {
    events: Vec<FlowEvent>,
    has_more_older: bool,
    next_cursor: Option<String>,
}

#[tokio::test]
async fn history_cursor_pages_walk_older_logs_without_overlap() {
    let mock_vlogs = spawn_mock_vlogs_server(build_mock_rows(2_505)).await;
    let vlogs_url = format!("{}/select/logsql/query", mock_vlogs.base_url);

    temp_env::async_with_vars(
        [("RESQ_FLOW_VLOGS_QUERY_URL", Some(vlogs_url.as_str()))],
        async {
    let server = common::spawn_server().await;
    let client = reqwest::Client::new();

    let page_one = client
        .get(format!(
            "{}/v1/history?flow_id=mail-pipeline&logs_only=true&limit=1000&window=6h",
            server.http_base
        ))
        .send()
        .await
        .expect("request first page")
        .error_for_status()
        .expect("first page success")
        .json::<HistoryResponseBody>()
        .await
        .expect("parse first page");

    assert_eq!(page_one.events.len(), 1_000);
    assert!(page_one.has_more_older);
    assert!(page_one.next_cursor.is_some());

    let page_two = client
        .get(format!(
            "{}/v1/history?flow_id=mail-pipeline&logs_only=true&limit=1000&cursor={}",
            server.http_base,
            page_one.next_cursor.as_deref().expect("page one cursor"),
        ))
        .send()
        .await
        .expect("request second page")
        .error_for_status()
        .expect("second page success")
        .json::<HistoryResponseBody>()
        .await
        .expect("parse second page");

    assert_eq!(page_two.events.len(), 1_000);
    assert!(page_two.has_more_older);
    assert!(page_two.next_cursor.is_some());

    let page_three = client
        .get(format!(
            "{}/v1/history?flow_id=mail-pipeline&logs_only=true&limit=1000&cursor={}",
            server.http_base,
            page_two.next_cursor.as_deref().expect("page two cursor"),
        ))
        .send()
        .await
        .expect("request third page")
        .error_for_status()
        .expect("third page success")
        .json::<HistoryResponseBody>()
        .await
        .expect("parse third page");

    assert_eq!(page_three.events.len(), 505);
    assert!(!page_three.has_more_older);
    assert!(page_three.next_cursor.is_none());

    let page_one_messages = event_messages(&page_one.events);
    let page_two_messages = event_messages(&page_two.events);
    let page_three_messages = event_messages(&page_three.events);

    assert!(page_one_messages.is_disjoint(&page_two_messages));
    assert!(page_one_messages.is_disjoint(&page_three_messages));
    assert!(page_two_messages.is_disjoint(&page_three_messages));

    let mut total = BTreeSet::new();
    total.extend(page_one_messages.iter().cloned());
    total.extend(page_two_messages.iter().cloned());
    total.extend(page_three_messages.iter().cloned());
    assert_eq!(total.len(), 2_505);

    let mismatched_cursor = client
        .get(format!(
            "{}/v1/history?flow_id=mail-pipeline&logs_only=true&limit=1000&query=different&cursor={}",
            server.http_base,
            page_one.next_cursor.as_deref().expect("cursor"),
        ))
        .send()
        .await
        .expect("request mismatched cursor");

    assert_eq!(mismatched_cursor.status(), reqwest::StatusCode::BAD_REQUEST);

    server.shutdown();
        },
    )
    .await;
    mock_vlogs.shutdown();
}

async fn spawn_mock_vlogs_server(rows: Vec<String>) -> MockVlogsServer {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind mock vlogs listener");
    let addr = listener.local_addr().expect("mock vlogs addr");

    let app = Router::new()
        .route("/select/logsql/query", get(mock_vlogs_query))
        .with_state(MockVlogsState {
            rows: Arc::new(rows),
        });

    let handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("mock vlogs server failed");
    });

    MockVlogsServer {
        base_url: format!("http://{addr}"),
        handle,
    }
}

async fn mock_vlogs_query(
    State(state): State<MockVlogsState>,
    Query(query): Query<MockVlogsQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(1_000);
    let start = state.rows.len().saturating_sub(limit);
    state.rows[start..].join("\n")
}

fn build_mock_rows(count: usize) -> Vec<String> {
    (0..count)
        .map(|index| {
            let total_seconds = index as u32;
            let total_minutes = total_seconds / 60;
            let timestamp = format!(
                "2026-04-11T{:02}:{:02}:{:02}.000Z",
                10 + (total_minutes / 60),
                total_minutes % 60,
                total_seconds % 60,
            );
            json!({
                "_time": timestamp,
                "_msg": format!("event-{index:04}"),
                "event": "flow_event",
                "flow_id": "mail-pipeline",
                "run_id": format!("mail-pipeline_run-{index:04}"),
                "component_id": "incoming-worker",
                "trace_id": format!("trace-{index:04}"),
                "span_id": format!("span-{index:04}"),
            })
            .to_string()
        })
        .collect()
}

fn event_messages(events: &[FlowEvent]) -> BTreeSet<String> {
    events
        .iter()
        .map(|event| event.message.clone().expect("event message"))
        .collect()
}
