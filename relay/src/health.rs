use std::collections::VecDeque;
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::json;

use crate::AppState;
use crate::models::{CapabilitiesResponse, IngestHealthResponse, SupportedIngestPaths};

const INGEST_RECENT_WINDOW_SECS: i64 = 60;

#[derive(Debug, Default)]
struct IngestStats {
    trace_count_total: u64,
    log_count_total: u64,
    trace_timestamps: VecDeque<DateTime<Utc>>,
    log_timestamps: VecDeque<DateTime<Utc>>,
    last_trace_at: Option<DateTime<Utc>>,
    last_log_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default)]
pub struct IngestHealth {
    inner: Arc<tokio::sync::Mutex<IngestStats>>,
}

impl IngestHealth {
    pub async fn record_traces(&self, event_count: usize, now: DateTime<Utc>) {
        let mut inner = self.inner.lock().await;
        inner.trace_count_total = inner.trace_count_total.saturating_add(event_count as u64);
        inner.last_trace_at = Some(now);
        inner.trace_timestamps.push_back(now);
        prune_recent(&mut inner.trace_timestamps, now);
    }

    pub async fn record_logs(&self, event_count: usize, now: DateTime<Utc>) {
        let mut inner = self.inner.lock().await;
        inner.log_count_total = inner.log_count_total.saturating_add(event_count as u64);
        inner.last_log_at = Some(now);
        inner.log_timestamps.push_back(now);
        prune_recent(&mut inner.log_timestamps, now);
    }

    pub async fn snapshot(
        &self,
        recent_buffer_size: usize,
        ws_lagged_events_total: u64,
    ) -> IngestHealthResponse {
        let now = Utc::now();
        let mut inner = self.inner.lock().await;
        prune_recent(&mut inner.trace_timestamps, now);
        prune_recent(&mut inner.log_timestamps, now);

        let trace_count_last_60s = inner.trace_timestamps.len();
        let log_count_last_60s = inner.log_timestamps.len();

        IngestHealthResponse {
            status: "ok",
            trace_count_total: inner.trace_count_total,
            log_count_total: inner.log_count_total,
            trace_count_last_60s,
            log_count_last_60s,
            last_trace_at: inner
                .last_trace_at
                .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
            last_log_at: inner
                .last_log_at
                .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true)),
            traces_recent: trace_count_last_60s > 0,
            logs_recent: log_count_last_60s > 0,
            recent_buffer_size,
            ws_lagged_events_total,
        }
    }
}

pub async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

pub async fn health_ingest(State(state): State<AppState>) -> Json<IngestHealthResponse> {
    let snapshot = state
        .ingest
        .snapshot(
            state.hub.recent_buffer_size().await,
            state.hub.lagged_events_total(),
        )
        .await;
    Json(snapshot)
}

pub async fn capabilities(State(state): State<AppState>) -> Json<CapabilitiesResponse> {
    Json(CapabilitiesResponse {
        service: "resq-flow-relay",
        bind: state.bind.as_ref().clone(),
        supported_ingest: SupportedIngestPaths {
            traces_path: "/v1/traces",
            logs_path: "/v1/logs",
            ws_path: "/ws",
        },
        recommended_mode: "collector-compatible",
        supported_modes: ["collector-compatible", "direct"],
    })
}

fn prune_recent(buffer: &mut VecDeque<DateTime<Utc>>, now: DateTime<Utc>) {
    let threshold = now - chrono::Duration::seconds(INGEST_RECENT_WINDOW_SECS);
    while buffer
        .front()
        .is_some_and(|timestamp| *timestamp < threshold)
    {
        buffer.pop_front();
    }
}
