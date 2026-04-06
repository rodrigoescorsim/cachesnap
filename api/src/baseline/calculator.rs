// Baseline calculator: roda via tokio task a cada hora.
// Para cada monitor × região, calcula avg e stddev dos últimos 7 dias.
// Resultado gravado em monitor_baselines (upsert).
//
// Implementação completa vem no Dia 5 do cronograma.

use crate::AppState;

pub async fn run(state: AppState) {
    tracing::info!("Baseline calculator started");
    // TODO Dia 5:
    // SELECT monitor_id, region,
    //        AVG(ttfb_ms) as avg, STDDEV(ttfb_ms) as stddev,
    //        COUNT(*) as sample_count
    // FROM probe_results
    // WHERE time > NOW() - INTERVAL '7 days'
    //   AND error IS NULL
    // GROUP BY monitor_id, region
    // → upsert em monitor_baselines
    let _ = state;
}
