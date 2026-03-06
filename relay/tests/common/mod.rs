use std::time::Duration;

use futures_util::StreamExt;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

pub struct TestServer {
    pub http_base: String,
    #[allow(dead_code)]
    pub ws_base: String,
    handle: JoinHandle<()>,
}

impl TestServer {
    pub fn shutdown(self) {
        self.handle.abort();
    }
}

pub type WsClient = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

pub async fn spawn_server() -> TestServer {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind listener");
    let addr = listener.local_addr().expect("listener addr");

    let app = resq_flow_relay::build_app(addr.to_string()).expect("build app");

    let handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("test server failed");
    });

    TestServer {
        http_base: format!("http://{addr}"),
        ws_base: format!("ws://{addr}"),
        handle,
    }
}

#[allow(dead_code)]
pub async fn connect_ws(url: &str) -> WsClient {
    let (stream, _) = connect_async(url).await.expect("connect websocket");
    stream
}

#[allow(dead_code)]
pub async fn recv_flow_event(socket: &mut WsClient) -> resq_flow_relay::FlowEvent {
    let mut events = recv_flow_events(socket).await;
    assert_eq!(events.len(), 1, "expected a single flow event message");
    events.remove(0)
}

#[allow(dead_code)]
pub async fn recv_flow_events(socket: &mut WsClient) -> Vec<resq_flow_relay::FlowEvent> {
    loop {
        let message = timeout(Duration::from_secs(2), socket.next())
            .await
            .expect("timed out waiting for websocket message")
            .expect("socket closed")
            .expect("websocket error");

        if let Message::Text(text) = message {
            if let Ok(envelope) = serde_json::from_str::<resq_flow_relay::WsEnvelope>(&text) {
                return match envelope {
                    resq_flow_relay::WsEnvelope::Snapshot { events }
                    | resq_flow_relay::WsEnvelope::Batch { events } => events,
                };
            }
            return vec![serde_json::from_str(&text).expect("deserialize FlowEvent")];
        }
    }
}

#[allow(dead_code)]
pub async fn expect_no_message(socket: &mut WsClient) {
    loop {
        let result = timeout(Duration::from_millis(250), socket.next()).await;
        match result {
            Err(_) => break,
            Ok(None) => break,
            Ok(Some(Ok(Message::Text(_)))) => {
                panic!("unexpected websocket FlowEvent received")
            }
            Ok(Some(Ok(_))) => continue,
            Ok(Some(Err(err))) => panic!("unexpected websocket error: {err}"),
        }
    }
}
