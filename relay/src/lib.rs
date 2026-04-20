use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

mod contracts;
mod devtools;
mod error;
mod flow_definitions;
mod health;
mod history;
mod ingest;
mod models;
mod paths;
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
    history_client: reqwest::Client,
    flow_definition_dir: Option<PathBuf>,
}

impl AppState {
    fn new(
        bind: String,
        hub: LiveHub,
        matcher: FlowMatcher,
        ingest: IngestHealth,
        history_client: reqwest::Client,
        flow_definition_dir: Option<PathBuf>,
    ) -> Self {
        Self {
            bind: Arc::new(bind),
            hub,
            matcher,
            ingest,
            history_client,
            flow_definition_dir,
        }
    }
}

pub fn build_app(bind: impl Into<String>) -> Result<Router, RelayError> {
    let registry = FlowRegistry::load_default()?;
    build_app_with_registry(bind.into(), registry)
}

pub fn build_app_with_contract_dir(
    bind: impl Into<String>,
    contract_dir: impl AsRef<Path>,
) -> Result<Router, RelayError> {
    let registry = FlowRegistry::load_from_dir(contract_dir.as_ref())?;
    build_app_with_registry(bind.into(), registry)
}

fn build_app_with_registry(bind: String, registry: FlowRegistry) -> Result<Router, RelayError> {
    let ui_dir = std::env::var("RESQ_FLOW_UI_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let ui_dir = ui_dir.or_else(|| paths::package_relative_dir("ui"));
    let flow_definition_dir = Some(flow_definitions::default_flow_definition_dir());
    build_app_with_registry_and_dirs(bind, registry, ui_dir, flow_definition_dir)
}

pub fn build_app_with_contract_dir_and_ui_dir(
    bind: impl Into<String>,
    contract_dir: impl AsRef<Path>,
    ui_dir: impl AsRef<Path>,
) -> Result<Router, RelayError> {
    let registry = FlowRegistry::load_from_dir(contract_dir.as_ref())?;
    build_app_with_registry_and_dirs(
        bind.into(),
        registry,
        Some(ui_dir.as_ref().to_path_buf()),
        Some(flow_definitions::default_flow_definition_dir()),
    )
}

pub fn build_app_with_contract_dir_and_flow_definition_dir(
    bind: impl Into<String>,
    contract_dir: impl AsRef<Path>,
    flow_definition_dir: impl AsRef<Path>,
) -> Result<Router, RelayError> {
    let registry = FlowRegistry::load_from_dir(contract_dir.as_ref())?;
    build_app_with_registry_and_dirs(
        bind.into(),
        registry,
        None,
        Some(flow_definition_dir.as_ref().to_path_buf()),
    )
}

fn build_app_with_registry_and_dirs(
    bind: String,
    registry: FlowRegistry,
    ui_dir: Option<PathBuf>,
    flow_definition_dir: Option<PathBuf>,
) -> Result<Router, RelayError> {
    let history_client = history::build_history_client()?;
    let state = AppState::new(
        bind,
        LiveHub::new(),
        FlowMatcher::new(registry),
        IngestHealth::default(),
        history_client,
        flow_definition_dir,
    );
    Ok(build_router(state, ui_dir))
}

fn build_router(state: AppState, ui_dir: Option<PathBuf>) -> Router {
    let router = Router::new()
        .route("/v1/dev/reset", post(devtools::reset_live_session))
        .route("/v1/traces", post(ingest::post_traces))
        .route("/v1/logs", post(ingest::post_logs))
        .route("/v1/flows", get(flow_definitions::get_flow_definitions))
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
        .with_state(state);

    if let Some(ui_dir) = ui_dir {
        let index_path = ui_dir.join("index.html");
        router
            .route_service("/", ServeFile::new(index_path.clone()))
            .route_service("/favicon.svg", ServeFile::new(ui_dir.join("favicon.svg")))
            .route_service("/favicon.png", ServeFile::new(ui_dir.join("favicon.png")))
            .nest_service("/assets", ServeDir::new(ui_dir.join("assets")))
            .fallback(move |uri: Uri| serve_spa_fallback(uri, index_path.clone()))
    } else {
        router
    }
}

async fn serve_spa_fallback(uri: Uri, index_path: PathBuf) -> Response {
    if is_reserved_static_or_api_path(uri.path()) {
        return StatusCode::NOT_FOUND.into_response();
    }

    match tokio::fs::read(index_path).await {
        Ok(body) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], body).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

fn is_reserved_static_or_api_path(path: &str) -> bool {
    matches!(
        path,
        "/v1"
            | "/assets"
            | "/favicon.svg"
            | "/favicon.png"
            | "/ws"
            | "/health"
            | "/health/ingest"
            | "/capabilities"
    ) || path.starts_with("/v1/")
        || path.starts_with("/assets/")
        || path.starts_with("/health/")
        || path.starts_with("/capabilities/")
        || path.starts_with("/ws/")
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
