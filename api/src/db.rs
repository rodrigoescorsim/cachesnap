use anyhow::{Context, Result};
use sqlx::migrate::MigrateError;
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

/// When a `.sql` file is edited after it was already applied, sqlx records a checksum mismatch.
/// We only update `_sqlx_migrations.checksum` to match the embedded migration (same as `sqlx migrate repair`);
/// migration SQL is **not** re-executed.
async fn resync_embedded_migration_checksums(pool: &PgPool, migrator: &sqlx::migrate::Migrator) -> Result<()> {
    for m in migrator.iter() {
        if m.migration_type.is_down_migration() {
            continue;
        }
        sqlx::query(
            r#"UPDATE _sqlx_migrations SET checksum = $1 WHERE version = $2"#,
        )
        .bind(m.checksum.as_ref())
        .bind(m.version)
        .execute(pool)
        .await
        .with_context(|| format!("UPDATE _sqlx_migrations checksum for version {}", m.version))?;
    }
    Ok(())
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    let migrator = sqlx::migrate!("../migrations");
    match migrator.run(pool).await {
        Ok(()) => {}
        Err(MigrateError::VersionMismatch(version)) => {
            tracing::warn!(
                version,
                "migration checksum mismatch vs _sqlx_migrations — syncing checksums (files changed after apply); SQL will not be re-run"
            );
            resync_embedded_migration_checksums(pool, &migrator)
                .await
                .context("repair migration checksums")?;
            migrator
                .run(pool)
                .await
                .context("run migrations after checksum repair")?;
        }
        Err(e) => return Err(e.into()),
    }
    tracing::info!("Migrations applied");
    Ok(())
}
