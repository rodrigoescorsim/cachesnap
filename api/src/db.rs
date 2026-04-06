use anyhow::Result;
use sqlx::postgres::{PgPool, PgPoolOptions};

pub async fn connect(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(database_url)
        .await?;

    tracing::info!("Database connected");
    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("../migrations").run(pool).await?;
    tracing::info!("Migrations applied");
    Ok(())
}
