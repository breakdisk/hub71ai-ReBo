mod api;
mod escalation;
mod model;
mod providers;
mod saga;
mod store;

use std::{env, net::SocketAddr};

use api::{router, AppState};
use escalation::EscalationRouting;
use store::Store;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind: SocketAddr = env::var("ONBOARD_ENGINE_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_owned())
        .parse()?;
    ensure_loopback_bind(bind)?;
    let environment = env::var("APP_ENV").unwrap_or_else(|_| "local-demo".to_owned());
    let escalation_routing = match env::var("ESCALATION_ROUTING_JSON") {
        Ok(raw) => EscalationRouting::from_json(&raw)?,
        Err(env::VarError::NotPresent) => EscalationRouting::default(),
        Err(error) => return Err(error.into()),
    };
    let (events, _) = broadcast::channel(256);
    let state = AppState::new(Store::default(), events, environment, escalation_routing);
    let listener = TcpListener::bind(bind).await?;

    println!("relocation-engine API listening on http://{bind}");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn ensure_loopback_bind(bind: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    if !bind.ip().is_loopback() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("refusing non-loopback bind {bind}: this unauthenticated demo is local-only"),
        )
        .into());
    }
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            signal.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use super::ensure_loopback_bind;

    #[test]
    fn unauthenticated_demo_only_binds_loopback_addresses() {
        assert!(ensure_loopback_bind("127.0.0.1:8080".parse::<SocketAddr>().unwrap()).is_ok());
        assert!(ensure_loopback_bind("[::1]:8080".parse::<SocketAddr>().unwrap()).is_ok());
        assert!(ensure_loopback_bind("0.0.0.0:8080".parse::<SocketAddr>().unwrap()).is_err());
    }
}
