// Motor de readiness do Edge Audit.
// Avalia evidência de cache efetivo e determina se o audit deve ser
// habilitado, mantido em warmup, ou desabilitado.
// Roda a cada 15 min via scheduler e event-driven no path de ingest (bootstrap).
//
// Todas as queries usam sqlx::query() (sem !) para manter compilação independente
// de a migration 026 já ter sido aplicada.

use crate::AppState;
use deadpool_redis::redis::cmd;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{error, info};
use uuid::Uuid;

// Thresholds v1 — revisados após Fase 6.3 via telemetria
pub const MIN_SAMPLES_NORMAL: i64 = 1;
const EDGE_HIT_RATIO_GATE: f64 = 0.1;
const COMPARABLE_PAIRS_GATE: i32 = 1;
const COMPARABLE_REGIONS_GATE: i32 = 1;
const DYNAMIC_SITE_BYPASS_RATIO: f64 = 0.95;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditState {
    Disabled,
    Warmup,
    Enabled,
}

impl AuditState {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuditState::Disabled => "disabled",
            AuditState::Warmup => "warmup",
            AuditState::Enabled => "enabled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "warmup" => AuditState::Warmup,
            "enabled" => AuditState::Enabled,
            _ => AuditState::Disabled,
        }
    }
}

struct ReadinessMetrics {
    sample_count: i64,
    edge_hit_ratio: f64,
    bypass_ratio: f64,
    comparable_pairs: i32,
    comparable_regions: i32,
}

/// Avalia readiness de um monitor e persiste resultado no banco.
/// Retorna `true` se deve ocorrer disparo imediato de probe (apenas em bootstrap
/// quando o estado transita para warmup ou enabled).
pub async fn evaluate_and_persist(state: &AppState, monitor_id: Uuid) -> bool {
    // Carregar meta atual do monitor (usa query() — sem check compile-time)
    let row = match sqlx::query(
        "SELECT audit_readiness_state, audit_readiness_updated_at, \
         audit_readiness_consecutive_hits, audit_interval_seconds \
         FROM monitors WHERE id = $1",
    )
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return false,
        Err(e) => {
            error!("readiness: db fetch for {monitor_id}: {e}");
            return false;
        }
    };

    use sqlx::Row;
    let current_state_str: String = row
        .try_get("audit_readiness_state")
        .unwrap_or_else(|_| "disabled".to_string());
    let updated_at: Option<chrono::DateTime<chrono::Utc>> =
        row.try_get("audit_readiness_updated_at").unwrap_or(None);
    let consecutive: i32 = row
        .try_get("audit_readiness_consecutive_hits")
        .unwrap_or(0);

    let is_bootstrap = updated_at.is_none();
    let current_state = AuditState::from_str(&current_state_str);

    // Calcular métricas da janela 1h
    let metrics = match calculate_metrics(&state.db, monitor_id).await {
        Some(m) => m,
        None => return false,
    };

    // Determinar estado alvo
    let insufficient = !is_bootstrap && metrics.sample_count < MIN_SAMPLES_NORMAL;
    // Melhoria #1: site intencionalmente dinâmico
    let is_dynamic = metrics.bypass_ratio >= DYNAMIC_SITE_BYPASS_RATIO
        && metrics.sample_count >= MIN_SAMPLES_NORMAL;

    let target = if insufficient || is_dynamic {
        AuditState::Disabled
    } else if metrics.comparable_pairs >= COMPARABLE_PAIRS_GATE
        && metrics.comparable_regions >= COMPARABLE_REGIONS_GATE
    {
        AuditState::Enabled
    } else if metrics.edge_hit_ratio >= EDGE_HIT_RATIO_GATE {
        AuditState::Warmup
    } else {
        AuditState::Disabled
    };

    // Anti-flapping (suprimido em bootstrap)
    let (new_state, new_consecutive) =
        apply_anti_flapping(&current_state, &target, consecutive, is_bootstrap);

    let reason = generate_reason(&new_state, &metrics, is_dynamic, insufficient);

    // Persistir
    let state_changed = new_state != current_state;
    if let Err(e) = persist(
        &state.db,
        monitor_id,
        &new_state,
        &reason,
        new_consecutive,
        metrics.comparable_pairs,
        metrics.comparable_regions,
        metrics.edge_hit_ratio,
    )
    .await
    {
        error!("readiness: persist for {monitor_id}: {e}");
        return false;
    }

    if state_changed {
        info!(
            "readiness: {monitor_id} {} → {}",
            current_state.as_str(),
            new_state.as_str()
        );
        if let Err(e) =
            log_transition(&state.db, monitor_id, &current_state, &new_state, &reason).await
        {
            error!("readiness: transition log for {monitor_id}: {e}");
        }
    }

    // Sinaliza disparo imediato apenas em bootstrap com transição positiva
    is_bootstrap && state_changed && new_state != AuditState::Disabled
}

/// Verifica cooldown de Redis e roda avaliação manual (botão "Re-check Now").
/// Retorna Err("rate_limited") se em cooldown, Ok(state_str) se bem-sucedido.
pub async fn manual_evaluate(state: &AppState, monitor_id: Uuid) -> Result<String, &'static str> {
    let mut conn = state
        .redis
        .get()
        .await
        .map_err(|_| "Redis unavailable")?;

    let key = format!("readiness_recheck:{monitor_id}");
    let now = chrono::Utc::now().timestamp();

    let script = r#"
        local last = redis.call('GET', KEYS[1])
        local now = tonumber(ARGV[1])
        if last and (now - tonumber(last)) < 120 then return 0 end
        redis.call('SET', KEYS[1], now, 'EX', 120)
        return 1
    "#;

    let allowed: i32 = cmd("EVAL")
        .arg(script)
        .arg(1)
        .arg(&key)
        .arg(now)
        .query_async(&mut conn)
        .await
        .map_err(|_| "Redis error")?;

    if allowed == 0 {
        return Err("rate_limited");
    }

    evaluate_and_persist(state, monitor_id).await;

    let new_state: String = sqlx::query_scalar(
        "SELECT audit_readiness_state FROM monitors WHERE id = $1",
    )
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "disabled".to_string());

    Ok(new_state)
}

async fn calculate_metrics(db: &PgPool, monitor_id: Uuid) -> Option<ReadinessMetrics> {
    #[derive(sqlx::FromRow)]
    struct HitRow {
        sample_count: Option<i64>,
        hit_ratio: Option<f64>,
        bypass_ratio: Option<f64>,
    }

    let hit_row = sqlx::query_as::<_, HitRow>(
        r#"
        SELECT
            COUNT(*)::bigint AS sample_count,
            (COUNT(*) FILTER (WHERE cache_status IN (
                'HIT','STALE','REVALIDATED','UPDATING','REVALIDATE','REFRESH_HIT'
            ))::float / NULLIF(COUNT(*), 0)::float) AS hit_ratio,
            (COUNT(*) FILTER (WHERE cache_status IN (
                'BYPASS','DYNAMIC','NONE','PASS','NO-CACHE',
                'UNCALCULABLE','UNCACHEABLE','IGNORED'
            ))::float / NULLIF(COUNT(*), 0)::float) AS bypass_ratio
        FROM probe_results
        WHERE monitor_id = $1
          AND time > NOW() - INTERVAL '1 hour'
          AND cache_status IS NOT NULL
        "#,
    )
    .bind(monitor_id)
    .fetch_optional(db)
    .await
    .ok()??;

    #[derive(sqlx::FromRow)]
    struct AuditRow {
        comparable_pairs: Option<i32>,
        comparable_regions: Option<i32>,
    }

    let audit_row = sqlx::query_as::<_, AuditRow>(
        r#"
        SELECT
            COUNT(*) FILTER (
                WHERE edge_cache_status IN (
                    'HIT','STALE','REVALIDATED','UPDATING','REVALIDATE','REFRESH_HIT'
                )
                AND (origin_cache_status IS NULL
                     OR origin_cache_status NOT IN ('HIT','HIDDEN'))
            )::int AS comparable_pairs,
            COUNT(DISTINCT region) FILTER (
                WHERE edge_cache_status IN (
                    'HIT','STALE','REVALIDATED','UPDATING','REVALIDATE','REFRESH_HIT'
                )
                AND (origin_cache_status IS NULL
                     OR origin_cache_status NOT IN ('HIT','HIDDEN'))
            )::int AS comparable_regions
        FROM audit_results
        WHERE monitor_id = $1
          AND time > NOW() - INTERVAL '1 hour'
        "#,
    )
    .bind(monitor_id)
    .fetch_optional(db)
    .await
    .ok()??;

    Some(ReadinessMetrics {
        sample_count: hit_row.sample_count.unwrap_or(0),
        edge_hit_ratio: hit_row.hit_ratio.unwrap_or(0.0),
        bypass_ratio: hit_row.bypass_ratio.unwrap_or(0.0),
        comparable_pairs: audit_row.comparable_pairs.unwrap_or(0),
        comparable_regions: audit_row.comparable_regions.unwrap_or(0),
    })
}

fn apply_anti_flapping(
    current: &AuditState,
    target: &AuditState,
    consecutive: i32,
    is_bootstrap: bool,
) -> (AuditState, i32) {
    if is_bootstrap {
        return (target.clone(), 0);
    }
    if target == current {
        return (current.clone(), 0);
    }
    let new_consecutive = consecutive + 1;
    if new_consecutive >= 2 {
        (target.clone(), 0)
    } else {
        (current.clone(), new_consecutive)
    }
}

fn generate_reason(
    state: &AuditState,
    metrics: &ReadinessMetrics,
    is_dynamic: bool,
    insufficient: bool,
) -> String {
    match state {
        AuditState::Disabled => {
            if is_dynamic {
                "Target URL is consistently dynamic (BYPASS). Infrastructure auditing is only applicable to cacheable content.".into()
            } else if insufficient {
                "Insufficient data — waiting for probes from all regions.".into()
            } else {
                "No verified edge cache hits yet. Waiting for effective cache before enabling audit.".into()
            }
        }
        AuditState::Warmup => format!(
            "Cache hits detected. Collecting confidence: {}/{} comparable pairs found.",
            metrics.comparable_pairs, COMPARABLE_PAIRS_GATE
        ),
        AuditState::Enabled => String::new(),
    }
}

async fn persist(
    db: &PgPool,
    monitor_id: Uuid,
    state: &AuditState,
    reason: &str,
    consecutive: i32,
    comparable_pairs: i32,
    comparable_regions: i32,
    edge_hit_ratio: f64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE monitors SET \
            audit_readiness_state              = $2, \
            audit_readiness_reason             = $3, \
            audit_readiness_consecutive_hits   = $4, \
            audit_readiness_comparable_pairs   = $5, \
            audit_readiness_comparable_regions = $6, \
            audit_readiness_edge_hit_ratio     = $7, \
            audit_readiness_updated_at         = NOW() \
         WHERE id = $1",
    )
    .bind(monitor_id)
    .bind(state.as_str())
    .bind(reason)
    .bind(consecutive)
    .bind(comparable_pairs)
    .bind(comparable_regions)
    .bind(edge_hit_ratio)
    .execute(db)
    .await?;
    Ok(())
}

async fn log_transition(
    db: &PgPool,
    monitor_id: Uuid,
    from: &AuditState,
    to: &AuditState,
    reason: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_state_transitions (monitor_id, from_state, to_state, reason) \
         VALUES ($1, $2, $3, $4)",
    )
    .bind(monitor_id)
    .bind(from.as_str())
    .bind(to.as_str())
    .bind(reason)
    .execute(db)
    .await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};

    #[test]
    fn test_anti_flapping_promotion() {
        let current = AuditState::Disabled;
        let target = AuditState::Warmup;

        // First hit: stays at current, consecutive becomes 1
        let (s1, c1) = apply_anti_flapping(&current, &target, 0, false);
        assert_eq!(s1, AuditState::Disabled);
        assert_eq!(c1, 1);

        // Second hit: promotes to target, consecutive resets to 0
        let (s2, c2) = apply_anti_flapping(&current, &target, 1, false);
        assert_eq!(s2, AuditState::Warmup);
        assert_eq!(c2, 0);
    }

    #[test]
    fn test_anti_flapping_demotion() {
        let current = AuditState::Enabled;
        let target = AuditState::Warmup;

        // First miss: stays at current, consecutive becomes 1
        let (s1, c1) = apply_anti_flapping(&current, &target, 0, false);
        assert_eq!(s1, AuditState::Enabled);
        assert_eq!(c1, 1);

        // Second miss: demotes to target
        let (s2, c2) = apply_anti_flapping(&current, &target, 1, false);
        assert_eq!(s2, AuditState::Warmup);
        assert_eq!(c2, 0);
    }

    #[test]
    fn test_bootstrap_immediate_promotion() {
        let current = AuditState::Disabled;
        let target = AuditState::Enabled;

        // Bootstrap suppresses anti-flapping
        let (s, c) = apply_anti_flapping(&current, &target, 0, true);
        assert_eq!(s, AuditState::Enabled);
        assert_eq!(c, 0);
    }

    #[test]
    fn test_generate_reason_variants() {
        let metrics = ReadinessMetrics {
            sample_count: 10,
            edge_hit_ratio: 0.1,
            bypass_ratio: 0.0,
            comparable_pairs: 2,
            comparable_regions: 1,
        };

        // Disabled - Insufficient cache
        let r1 = generate_reason(&AuditState::Disabled, &metrics, false, false);
        assert!(r1.contains("No verified edge cache hits yet"));

        // Disabled - Insufficient data (samples)
        let r2 = generate_reason(&AuditState::Disabled, &metrics, false, true);
        assert!(r2.contains("Insufficient data"));

        // Disabled - Dynamic site
        let r3 = generate_reason(&AuditState::Disabled, &metrics, true, false);
        assert!(r3.contains("consistently dynamic"));

        // Warmup
        let r4 = generate_reason(&AuditState::Warmup, &metrics, false, false);
        assert!(r4.contains("Collecting confidence"));
        assert!(r4.contains("2/8"));
    }

    // Integration test: requires DATABASE_URL to be set
    #[tokio::test]
    #[ignore] // Run manually or in CI with DB
    async fn test_full_readiness_lifecycle() {
        use crate::config::Config;
        let config = Config::from_env().expect("Config");
        let pool = PgPool::connect(&config.database_url).await.expect("DB connect");
        let state = AppState::test_with_db(pool.clone(), config);

        let monitor_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();

        // 1. Setup monitor
        sqlx::query("INSERT INTO monitors (id, user_id, url, name, check_interval_seconds, alert_threshold_ms, audit_readiness_state) \
                     VALUES ($1, $2, 'https://test-readiness.com', 'Test', 60, 500, 'disabled')")
            .bind(monitor_id)
            .bind(user_id)
            .execute(&pool)
            .await.unwrap();

        // 2. Initial evaluation (no data)
        let needs_dispatch = evaluate_and_persist(&state, monitor_id).await;
        assert!(!needs_dispatch);

        let row: (String, Option<String>) = sqlx::query_as("SELECT audit_readiness_state, audit_readiness_reason FROM monitors WHERE id = $1")
            .bind(monitor_id)
            .fetch_one(&pool)
            .await.unwrap();
        assert_eq!(row.0, "disabled");
        assert!(row.1.unwrap().contains("Insufficient data"));

        // 3. Add probe data (hits)
        for _ in 0..5 {
            sqlx::query("INSERT INTO probe_results (time, monitor_id, region, ttfb_ms, cache_status) \
                         VALUES (NOW(), $1, 'us-east-1', 100, 'HIT')")
                .bind(monitor_id)
                .execute(&pool)
                .await.unwrap();
        }

        // 4. Evaluate (should go to Warmup - bypasses anti-flapping because updated_at was set once but let's re-verify logic)
        // Wait, evaluation 1 set updated_at. So evaluation 2 is NOT bootstrap.
        // It needs 2 hits to promote.
        evaluate_and_persist(&state, monitor_id).await; // 1st hit
        evaluate_and_persist(&state, monitor_id).await; // 2nd hit -> Warmup

        let state_str: String = sqlx::query_scalar("SELECT audit_readiness_state FROM monitors WHERE id = $1")
            .bind(monitor_id)
            .fetch_one(&pool)
            .await.unwrap();
        assert_eq!(state_str, "warmup");

        // 5. Cleanup
        sqlx::query("DELETE FROM probe_results WHERE monitor_id = $1").bind(monitor_id).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM monitors WHERE id = $1").bind(monitor_id).execute(&pool).await.unwrap();
    }
}
