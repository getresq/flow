use std::net::SocketAddr;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "resq_flow_relay=debug,tower_http=info".to_string()),
        )
        .init();

    let bind_addr = std::env::var("RESQ_FLOW_BIND").unwrap_or_else(|_| "0.0.0.0:4200".to_string());
    let addr: SocketAddr = bind_addr
        .parse()
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidInput, err))?;

    resq_flow_relay::run_server(addr).await
}
