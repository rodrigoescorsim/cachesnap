mod alerts;
mod baseline;
mod cache_status;
mod config;
mod db;
mod diagnosis;
mod env;
mod models;
mod redis;
mod routes;
mod scheduler;
mod trend;
mod utils;

use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;

use crate::scheduler::dispatch_limiter::ProbeDispatchLimits;
use axum::http::{HeaderValue, Method, header};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: deadpool_redis::Pool,
    pub config: Arc<config::Config>,
    pub http: reqwest::Client,
    pub probe_limits: Arc<ProbeDispatchLimits>,
    pub tx: broadcast::Sender<String>,
}

impl AppState {
    #[cfg(test)]
    pub fn test_with_db(db: PgPool, config: crate::config::Config) -> Self {
        let (tx, _) = broadcast::channel(1);
        let http = reqwest::Client::new();
        let config_arc = Arc::new(config);
        let probe_limits = Arc::new(ProbeDispatchLimits::new(Arc::new(
            config_arc.probe_dispatch.clone(),
        )));

        // Redis pool (requires local redis for these tests)
        let redis_cfg = deadpool_redis::Config::from_url("redis://127.0.0.1:6379");
        let redis = redis_cfg
            .create_pool(Some(deadpool_redis::Runtime::Tokio1))
            .unwrap();

        Self {
            db,
            redis,
            config: config_arc,
            http,
            probe_limits,
            tx,
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Root .env + api/.env (monorepo — RESEND_API_KEY etc. live at repo root)
    env::load_dotenv_files();

    // Logging — set RUST_LOG_FORMAT=json for structured JSON output (e.g. Loki, CloudWatch).
    let log_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "api=debug,tower_http=info".into());

    if std::env::var("RUST_LOG_FORMAT").as_deref() == Ok("json") {
        tracing_subscriber::registry()
            .with(log_filter)
            .with(tracing_subscriber::fmt::layer().json())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(log_filter)
            .with(tracing_subscriber::fmt::layer())
            .init();
    }

    let config = Arc::new(config::Config::from_env()?);
    let (tx, _rx) = broadcast::channel(1024);

    // Conexões
    let db = db::connect(&config.database_url).await?;
    let redis = redis::connect(&config.redis_url)?;
    db::run_migrations(&db).await?;

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .expect("reqwest Client");

    let probe_limits = Arc::new(ProbeDispatchLimits::new(Arc::new(
        config.probe_dispatch.clone(),
    )));

    let state = AppState {
        db: db.clone(),
        redis,
        config: config.clone(),
        http,
        probe_limits,
        tx,
    };

    // background tasks
    tokio::spawn(scheduler::runner::start(state.clone()));
    tokio::spawn(baseline::calculator::run(state.clone()));
    tokio::spawn(alerts::worker::run(state.clone()));
    tokio::spawn(trend::baseline_computer::run(state.clone()));

    let allowed_origin: HeaderValue = config
        .app_url
        .parse()
        .expect("APP_URL is not a valid HTTP origin");

    let cors = CorsLayer::new()
        .allow_origin(allowed_origin)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .allow_credentials(true);

    // Router
    let app = Router::new()
        .route("/health", get(routes::health::handler))
        .route("/api/events", get(routes::events::handler))
        .route("/api/ingest", post(routes::ingest::handler))
        .route("/api/public/dispatch", post(routes::public_dispatch::handler))
        .route("/api/monitors/active", get(routes::monitors::list_active))
        .route("/api/monitors/:id/dispatch", post(routes::dispatch::handler))
        .route("/api/monitors/:id/evaluate-readiness", post(routes::evaluate::handler))
        .route(
            "/api/monitors/:id/incidents/:incident_id/snooze",
            get(routes::alerts::snooze_incident),
        )
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {addr}");

    axum::serve(listener, app).await?;
    Ok(())
}

// force rebuild
