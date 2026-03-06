use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use tokio::sync::broadcast;
use tokio::time::{self, MissedTickBehavior};

use crate::AppState;
use crate::models::{FlowEvent, WsEnvelope, annotate_flow_event};

const BROADCAST_BUFFER_SIZE: usize = 2_048;
const RECENT_EVENT_LIMIT: usize = 1_024;
const WS_BATCH_INTERVAL_MS: u64 = 40;
const WS_BATCH_MAX_EVENTS: usize = 256;

#[derive(Debug, Clone)]
pub struct LiveHub {
    tx: broadcast::Sender<FlowEvent>,
    next_seq: Arc<AtomicU64>,
    recent_events: Arc<tokio::sync::Mutex<VecDeque<FlowEvent>>>,
    lagged_events_total: Arc<AtomicU64>,
}

impl Default for LiveHub {
    fn default() -> Self {
        Self::new()
    }
}

impl LiveHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_BUFFER_SIZE);
        Self {
            tx,
            next_seq: Arc::new(AtomicU64::new(1)),
            recent_events: Arc::new(tokio::sync::Mutex::new(VecDeque::with_capacity(
                RECENT_EVENT_LIMIT,
            ))),
            lagged_events_total: Arc::new(AtomicU64::new(0)),
        }
    }

    pub async fn publish(&self, mut events: Vec<FlowEvent>) -> usize {
        if events.is_empty() {
            return 0;
        }

        let mut recent = self.recent_events.lock().await;
        for event in &mut events {
            annotate_flow_event(event, &self.next_seq);
            recent.push_back(event.clone());
            while recent.len() > RECENT_EVENT_LIMIT {
                recent.pop_front();
            }
            let _ = self.tx.send(event.clone());
        }
        events.len()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<FlowEvent> {
        self.tx.subscribe()
    }

    pub async fn snapshot(&self) -> Vec<FlowEvent> {
        self.recent_events.lock().await.iter().cloned().collect()
    }

    pub async fn recent_buffer_size(&self) -> usize {
        self.recent_events.lock().await.len()
    }

    pub fn record_lagged(&self, skipped: u64) {
        self.lagged_events_total
            .fetch_add(skipped, Ordering::Relaxed);
    }

    pub fn lagged_events_total(&self) -> u64 {
        self.lagged_events_total.load(Ordering::Relaxed)
    }
}

pub async fn ws_upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    let hub = state.hub.clone();
    ws.on_upgrade(move |socket| handle_ws(socket, hub))
}

async fn handle_ws(mut socket: WebSocket, hub: LiveHub) {
    let snapshot = hub.snapshot().await;
    if !snapshot.is_empty()
        && send_envelope(&mut socket, WsEnvelope::Snapshot { events: snapshot })
            .await
            .is_err()
    {
        return;
    }

    let mut rx = hub.subscribe();
    let mut heartbeat = time::interval(Duration::from_secs(20));
    let mut flush_tick = time::interval(Duration::from_millis(WS_BATCH_INTERVAL_MS));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    flush_tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
    heartbeat.tick().await;
    flush_tick.tick().await;

    let mut pending = Vec::new();

    loop {
        tokio::select! {
            biased;

            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(event) = serde_json::from_str::<FlowEvent>(&text) {
                            let _ = hub.publish(vec![event]).await;
                        }
                    }
                    Some(Err(error)) => {
                        tracing::debug!(error = ?error, "websocket receive error");
                        break;
                    }
                    _ => {}
                }
            }
            maybe_event = rx.recv() => {
                match maybe_event {
                    Ok(event) => {
                        pending.push(event);
                        if pending.len() >= WS_BATCH_MAX_EVENTS
                            && flush_pending(&mut socket, &mut pending).await.is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        hub.record_lagged(skipped);
                        tracing::debug!(skipped, "ws client lagged, dropping stale events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            _ = flush_tick.tick() => {
                if flush_pending(&mut socket, &mut pending).await.is_err() {
                    break;
                }
            }
            _ = heartbeat.tick() => {
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn flush_pending(socket: &mut WebSocket, pending: &mut Vec<FlowEvent>) -> Result<(), ()> {
    if pending.is_empty() {
        return Ok(());
    }

    let events = std::mem::take(pending);
    send_envelope(socket, WsEnvelope::Batch { events }).await
}

async fn send_envelope(socket: &mut WebSocket, envelope: WsEnvelope) -> Result<(), ()> {
    let text = serde_json::to_string(&envelope).map_err(|error| {
        tracing::error!(error = ?error, "failed to serialize websocket envelope");
    })?;
    socket
        .send(Message::Text(text.into()))
        .await
        .map_err(|_| ())
}
