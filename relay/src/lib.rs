use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::routing::{get, post};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

mod contracts;
mod error;
mod health;
mod history;
mod ingest;
mod models;
mod ws;

use contracts::{FlowMatcher, FlowRegistry};
use error::RelayError;
use health::IngestHealth;
use ws::LiveHub;

pub use models::{FlowEvent, WsEnvelope};

#[derive(Clone)]
pub(crate) struct AppState {
    bind: Arc<String>,
    hub: LiveHub,
    matcher: FlowMatcher,
    ingest: IngestHealth,
}

impl AppState {
    fn new(bind: String, hub: LiveHub, matcher: FlowMatcher, ingest: IngestHealth) -> Self {
        Self {
            bind: Arc::new(bind),
            hub,
            matcher,
            ingest,
        }
    }
}

pub fn build_app(bind: impl Into<String>) -> Result<Router, RelayError> {
    let registry = FlowRegistry::load_default()?;
    let state = AppState::new(
        bind.into(),
        LiveHub::new(),
        FlowMatcher::new(registry),
        IngestHealth::default(),
    );
    Ok(build_router(state))
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/v1/traces", post(ingest::post_traces))
        .route("/v1/logs", post(ingest::post_logs))
        .route("/v1/history", get(history::get_history))
        .route("/ws", get(ws::ws_upgrade))
        .route("/health", get(health::health))
        .route("/health/ingest", get(health::health_ingest))
        .route("/capabilities", get(health::capabilities))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    "http://localhost:5173".parse().expect("valid origin"),
                    "http://127.0.0.1:5173".parse().expect("valid origin"),
                ])
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::OPTIONS,
                ])
                .allow_headers(Any),
        )
        .with_state(state)
}

pub async fn run_server(addr: SocketAddr) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    let local_addr = listener.local_addr()?;
    tracing::info!(
        bind = %local_addr,
        recommended_mode = "collector-compatible",
        traces_path = "/v1/traces",
        logs_path = "/v1/logs",
        ws_path = "/ws",
        "resq-flow relay listening"
    );

    let app = build_app(local_addr.to_string())
        .map_err(|error| std::io::Error::other(format!("failed to build relay app: {error:?}")))?;
    axum::serve(listener, app).await
}
