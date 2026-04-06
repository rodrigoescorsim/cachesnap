mod alerts;
mod baseline;
mod config;
mod db;
mod diagnosis;
mod models;
mod redis;
mod routes;
mod scheduler;

use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: deadpool_redis::Pool,
    pub config: Arc<config::Config>,
    pub http: reqwest::Client, // cliente compartilhado — reutiliza connection pool
}

#[tokio::main]
async fn main() -> Result<()> {
    // Carregar .env (ignorado se as vars já estiverem no ambiente — Docker/VPS)
    dotenvy::dotenv().ok();

    // Logging estruturado
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hoplens_api=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(config::Config::from_env()?);
    tracing::info!("Starting HopLens API on port {}", config.port);

    // Conexões
    let db = db::connect(&config.database_url).await?;
    let redis = redis::connect(&config.redis_url)?;

    // Migrations automáticas na inicialização
    db::run_migrations(&db).await?;

    let state = AppState {
        db: db.clone(),
        redis,
        config: config.clone(),
        http: reqwest::Client::new(),
    };

    // Iniciar tarefas de background em tokio tasks separadas
    tokio::spawn(scheduler::runner::start(state.clone()));
    tokio::spawn(baseline::calculator::run(state.clone()));

    // Router
    let app = Router::new()
        .route("/health", get(routes::health::handler))
        .route("/api/ingest", post(routes::ingest::handler))
        .route("/api/monitors/active", get(routes::monitors::list_active))
        .route("/api/monitors/{id}/dispatch", post(routes::dispatch::handler))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {addr}");

    axum::serve(listener, app).await?;
    Ok(())
}
