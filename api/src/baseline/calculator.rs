// Baseline calculator: processa dados históricos para definir o "normal" (baselines).
// Roda periodicamente para atualizar as métricas de cada monitor por região.

use crate::AppState;
use tokio::time::{interval, Duration};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct BaselineAggRow {
    monitor_id: Uuid,
    region: String,
    ttfb_avg_ms: Option<f64>,
    ttfb_stddev_ms: Option<f64>,
    sample_count: Option<i64>,
    cache_hit_rate: Option<f64>,
    ttfb_hit_avg_ms: Option<f64>,
    ttfb_hit_stddev_ms: Option<f64>,
    ttfb_hit_sample_count: Option<i64>,
    ttfb_miss_avg_ms: Option<f64>,
    ttfb_miss_stddev_ms: Option<f64>,
    ttfb_miss_sample_count: Option<i64>,
}

pub async fn run(state: AppState) {
    info!("Baseline calculator worker started — analysis window: 7 days");

    // Roda uma vez na inicialização e depois a cada 1 hora
    let mut ticker = interval(Duration::from_secs(3600));

    loop {
        ticker.tick().await;

        info!("Starting baseline recalculation cycle...");

        // Agregados dos últimos 7 dias + baselines estratificados (HIT vs MISS explícito).
        // `cache_hit_rate` usa o mesmo denominador de `probe_results_hourly.cdn_count`
        // para evitar contar BYPASS/DYNAMIC como "miss" — alinha com `probe_is_cache_hit`
        // no detector de anomalias.
        let sql = format!(
            r#"
            SELECT
                monitor_id,
                region,
                AVG(ttfb_ms) AS ttfb_avg_ms,
                STDDEV(ttfb_ms) AS ttfb_stddev_ms,
                COUNT(*) AS sample_count,
                (COUNT(*) FILTER (WHERE {hit}))::FLOAT
                    / NULLIF(COUNT(*) FILTER (WHERE {cdn}), 0) AS cache_hit_rate,
                AVG(ttfb_ms) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED'))
                    AS ttfb_hit_avg_ms,
                STDDEV(ttfb_ms) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED'))
                    AS ttfb_hit_stddev_ms,
                COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED'))
                    AS ttfb_hit_sample_count,
                AVG(ttfb_ms) FILTER (WHERE cache_status IS NOT NULL
                    AND cache_status NOT IN ('HIT', 'STALE', 'REVALIDATED'))
                    AS ttfb_miss_avg_ms,
                STDDEV(ttfb_ms) FILTER (WHERE cache_status IS NOT NULL
                    AND cache_status NOT IN ('HIT', 'STALE', 'REVALIDATED'))
                    AS ttfb_miss_stddev_ms,
                COUNT(*) FILTER (WHERE cache_status IS NOT NULL
                    AND cache_status NOT IN ('HIT', 'STALE', 'REVALIDATED'))
                    AS ttfb_miss_sample_count
            FROM probe_results
            WHERE time > NOW() - INTERVAL '7 days'
              AND error IS NULL
              AND ttfb_ms IS NOT NULL
            GROUP BY monitor_id, region
            "#,
            hit = crate::cache_status::CACHE_HIT_FILTER,
            cdn = crate::cache_status::CACHE_CDN_CLASSIFIABLE_FILTER,
        );
        let results = sqlx::query_as::<_, BaselineAggRow>(&sql)
        .fetch_all(&state.db)
        .await;

        match results {
            Ok(baselines) => {
                for b in &baselines {
                    let upsert = sqlx::query(
                        r#"
                        INSERT INTO monitor_baselines (
                            monitor_id, region, ttfb_avg_ms, ttfb_stddev_ms, cache_hit_rate, sample_count,
                            ttfb_hit_avg_ms, ttfb_hit_stddev_ms, ttfb_hit_sample_count,
                            ttfb_miss_avg_ms, ttfb_miss_stddev_ms, ttfb_miss_sample_count,
                            calculated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
                        )
                        ON CONFLICT (monitor_id, region) DO UPDATE SET
                            ttfb_avg_ms = EXCLUDED.ttfb_avg_ms,
                            ttfb_stddev_ms = EXCLUDED.ttfb_stddev_ms,
                            cache_hit_rate = EXCLUDED.cache_hit_rate,
                            sample_count = EXCLUDED.sample_count,
                            ttfb_hit_avg_ms = EXCLUDED.ttfb_hit_avg_ms,
                            ttfb_hit_stddev_ms = EXCLUDED.ttfb_hit_stddev_ms,
                            ttfb_hit_sample_count = EXCLUDED.ttfb_hit_sample_count,
                            ttfb_miss_avg_ms = EXCLUDED.ttfb_miss_avg_ms,
                            ttfb_miss_stddev_ms = EXCLUDED.ttfb_miss_stddev_ms,
                            ttfb_miss_sample_count = EXCLUDED.ttfb_miss_sample_count,
                            calculated_at = NOW()
                        "#,
                    )
                    .bind(b.monitor_id)
                    .bind(&b.region)
                    .bind(b.ttfb_avg_ms)
                    .bind(b.ttfb_stddev_ms)
                    .bind(b.cache_hit_rate)
                    .bind(b.sample_count.map(|c| c as i32))
                    .bind(b.ttfb_hit_avg_ms)
                    .bind(b.ttfb_hit_stddev_ms)
                    .bind(b.ttfb_hit_sample_count.map(|c| c as i32))
                    .bind(b.ttfb_miss_avg_ms)
                    .bind(b.ttfb_miss_stddev_ms)
                    .bind(b.ttfb_miss_sample_count.map(|c| c as i32))
                    .execute(&state.db)
                    .await;

                    if let Err(e) = upsert {
                        error!(
                            "Failed to upsert baseline for monitor {:?} in region {}: {}",
                            b.monitor_id, b.region, e
                        );
                    }
                }
                info!(
                    "Baseline recalculation cycle completed — processed {} entries",
                    baselines.len()
                );
            }
            Err(e) => {
                error!("Failed to fetch baseline aggregates: {}", e);
            }
        }
    }
}
