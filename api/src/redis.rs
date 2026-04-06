use anyhow::Result;
use deadpool_redis::{Config as RedisConfig, Pool, Runtime};

pub fn connect(redis_url: &str) -> Result<Pool> {
    let cfg = RedisConfig::from_url(redis_url);
    let pool = cfg.create_pool(Some(Runtime::Tokio1))?;
    tracing::info!("Redis pool created");
    Ok(pool)
}
