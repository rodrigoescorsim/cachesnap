// Baseline calculator: processa dados históricos para definir o "normal" (baselines).
// Roda periodicamente para atualizar as métricas de cada monitor por região.

use crate::AppState;
use tokio::time::{interval, Duration};
use tracing::{info, error};

pub async fn run(state: AppState) {
    info!("Baseline calculator worker started — analysis window: 7 days");
    
    // Roda uma vez na inicialização e depois a cada 1 hora
    let mut ticker = interval(Duration::from_secs(3600));

    loop {
        ticker.tick().await;
        
        info!("Starting baseline recalculation cycle...");
        
        // 1. Calcular agregados estatísticos dos últimos 7 dias
        // Filtramos erros para não poluir a média de performance.
        let results = sqlx::query!(
            r#"
            SELECT 
                monitor_id, 
                region,
                AVG(ttfb_ms) as ttfb_avg_ms,
                STDDEV(ttfb_ms) as ttfb_stddev_ms,
                COUNT(*) as sample_count,
                -- Cálculo centralizado de cache hit rate: HIT, STALE, REVALIDATED, UPDATING
                (COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING'))) :: FLOAT / 
                NULLIF(COUNT(*), 0) as cache_hit_rate
            FROM probe_results
            WHERE time > NOW() - INTERVAL '7 days'
              AND error IS NULL
              AND ttfb_ms IS NOT NULL
            GROUP BY monitor_id, region
            "#
        )
        .fetch_all(&state.db)
        .await;

        match results {
            Ok(baselines) => {
                for b in &baselines {
                    // 2. UPSERT na tabela monitor_baselines
                    let upsert = sqlx::query!(
                        r#"
                        INSERT INTO monitor_baselines (
                            monitor_id, region, ttfb_avg_ms, ttfb_stddev_ms, cache_hit_rate, sample_count, calculated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, NOW()
                        )
                        ON CONFLICT (monitor_id, region) DO UPDATE SET
                            ttfb_avg_ms = EXCLUDED.ttfb_avg_ms,
                            ttfb_stddev_ms = EXCLUDED.ttfb_stddev_ms,
                            cache_hit_rate = EXCLUDED.cache_hit_rate,
                            sample_count = EXCLUDED.sample_count,
                            calculated_at = NOW()
                        "#,
                        b.monitor_id,
                        b.region,
                        b.ttfb_avg_ms,
                        b.ttfb_stddev_ms,
                        b.cache_hit_rate,
                        b.sample_count.map(|c| c as i32)
                    )
                    .execute(&state.db)
                    .await;

                    if let Err(e) = upsert {
                        error!("Failed to upsert baseline for monitor {:?} in region {}: {}", b.monitor_id, b.region, e);
                    }
                }
                info!("Baseline recalculation cycle completed — processed {} entries", baselines.len());
            },
            Err(e) => {
                error!("Failed to fetch baseline aggregates: {}", e);
            }
        }
    }
}
