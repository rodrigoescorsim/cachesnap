use crate::AppState;
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};
use uuid::Uuid;

pub async fn run(state: AppState) {
    // 65-minute offset ensures the CAGG refresh (every hour on the hour) has completed before we compute.
    info!("Trend baseline computer started — computing every 65 minutes");
    let mut ticker = interval(Duration::from_secs(65 * 60));

    loop {
        ticker.tick().await;
        if let Err(e) = compute_cycle(&state).await {
            error!("trend_baseline_computer: cycle error: {}", e);
        }
    }
}

async fn compute_cycle(state: &AppState) -> Result<(), anyhow::Error> {
    // Last fully-closed bucket hour: trunc(now, hour) - 1h
    let bucket_hour: chrono::DateTime<chrono::Utc> = sqlx::query_scalar(
        "SELECT date_trunc('hour', NOW()) - INTERVAL '1 hour'",
    )
    .fetch_one(&state.db)
    .await?;

    info!("trend_baseline_computer: computing baselines for bucket {}", bucket_hour);

    // Distinct (monitor_id, region) pairs with data in this bucket
    let pairs = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT DISTINCT ph.monitor_id, ph.region FROM probe_results_hourly ph JOIN monitors m ON ph.monitor_id = m.id WHERE ph.bucket = $1",
    )
    .bind(bucket_hour)
    .fetch_all(&state.db)
    .await?;

    if pairs.is_empty() {
        warn!("trend_baseline_computer: no data for bucket {}", bucket_hour);
        return Ok(());
    }

    // Collect distinct monitor_ids to compute globals after regional pass
    // sort_unstable required before dedup — dedup only removes consecutive duplicates
    let mut monitor_ids: Vec<Uuid> = pairs.iter().map(|(m, _)| *m).collect();
    monitor_ids.sort_unstable();
    monitor_ids.dedup();

    let mut regional_count = 0usize;

    for (monitor_id, region) in &pairs {
        if let Err(e) = upsert_regional_baselines(state, *monitor_id, region, bucket_hour).await {
            error!("trend_baseline_computer: regional baseline error monitor={} region={}: {}", monitor_id, region, e);
        } else {
            regional_count += 1;
        }
    }

    let mut global_count = 0usize;

    for monitor_id in &monitor_ids {
        if let Err(e) = upsert_global_baselines(state, *monitor_id, bucket_hour).await {
            error!("trend_baseline_computer: global baseline error monitor={}: {}", monitor_id, e);
        } else {
            global_count += 1;
        }
    }

    info!(
        "trend_baseline_computer: done — {} regional + {} global baselines for bucket {}",
        regional_count, global_count, bucket_hour
    );
    Ok(())
}

struct HourlyData {
    hit_count: i64,
    total_count: i64,
    ttfb_sum_ms: Option<f64>,
    sample_count: i64,
}

async fn fetch_hourly(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    bucket: chrono::DateTime<chrono::Utc>,
) -> Result<Option<HourlyData>, sqlx::Error> {
    let row = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<f64>, Option<i64>)>(
        r#"
        SELECT hit_count::BIGINT, total_count::BIGINT, ttfb_sum_ms, sample_count::BIGINT
        FROM probe_results_hourly
        WHERE monitor_id = $1 AND region = $2 AND bucket = $3
        LIMIT 1
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(bucket)
    .fetch_optional(&state.db)
    .await?;

    Ok(row.map(|(h, t, s, sc)| HourlyData {
        hit_count: h.unwrap_or(0),
        total_count: t.unwrap_or(0),
        ttfb_sum_ms: s,
        sample_count: sc.unwrap_or(0),
    }))
}

async fn fetch_day_avg(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    bucket: chrono::DateTime<chrono::Utc>,
) -> Result<Option<HourlyData>, sqlx::Error> {
    // Aggregate always returns one row; fetch_one is semantically correct here.
    let (h, t, s, sc) = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<f64>, Option<i64>)>(
        r#"
        SELECT
            SUM(hit_count)::BIGINT    AS hit_count,
            SUM(total_count)::BIGINT  AS total_count,
            SUM(ttfb_sum_ms)          AS ttfb_sum_ms,
            SUM(sample_count)::BIGINT AS sample_count
        FROM probe_results_hourly
        WHERE monitor_id = $1
          AND region = $2
          AND bucket >= $3 - INTERVAL '24 hours'
          AND bucket < $3
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(bucket)
    .fetch_one(&state.db)
    .await?;

    Ok(if t.unwrap_or(0) == 0 { None } else {
        Some(HourlyData {
            hit_count: h.unwrap_or(0),
            total_count: t.unwrap_or(0),
            ttfb_sum_ms: s,
            sample_count: sc.unwrap_or(0),
        })
    })
}

fn cache_hit_pct(d: &HourlyData) -> Option<f64> {
    if d.total_count == 0 { return None; }
    Some(d.hit_count as f64 / d.total_count as f64 * 100.0)
}

fn ttfb_avg_ms(d: &HourlyData) -> Option<f64> {
    if d.sample_count == 0 { return None; }
    d.ttfb_sum_ms.map(|s| s / d.sample_count as f64)
}

async fn upsert_baseline_row(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
    metric: &str,
    current_value: Option<f64>,
    current_samples: i64,
    prev_hour_value: Option<f64>,
    prev_hour_samples: i64,
    same_hour_yday_value: Option<f64>,
    same_hour_yday_samples: i64,
    day_avg_value: Option<f64>,
    day_avg_samples: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO trend_baselines (
            monitor_id, region, bucket_hour, metric,
            current_value, current_samples,
            prev_hour_value, prev_hour_samples,
            same_hour_yday_value, same_hour_yday_samples,
            day_avg_value, day_avg_samples,
            computed_at
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6,
            $7, $8,
            $9, $10,
            $11, $12,
            NOW()
        )
        ON CONFLICT (monitor_id, region, bucket_hour, metric) DO UPDATE SET
            current_value          = EXCLUDED.current_value,
            current_samples        = EXCLUDED.current_samples,
            prev_hour_value        = EXCLUDED.prev_hour_value,
            prev_hour_samples      = EXCLUDED.prev_hour_samples,
            same_hour_yday_value   = EXCLUDED.same_hour_yday_value,
            same_hour_yday_samples = EXCLUDED.same_hour_yday_samples,
            day_avg_value          = EXCLUDED.day_avg_value,
            day_avg_samples        = EXCLUDED.day_avg_samples,
            computed_at            = NOW()
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(bucket_hour)
    .bind(metric)
    .bind(current_value)
    .bind(current_samples as i32)
    .bind(prev_hour_value)
    .bind(prev_hour_samples as i32)
    .bind(same_hour_yday_value)
    .bind(same_hour_yday_samples as i32)
    .bind(day_avg_value)
    .bind(day_avg_samples as i32)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn upsert_regional_baselines(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> Result<(), anyhow::Error> {
    let current = match fetch_hourly(state, monitor_id, region, bucket_hour).await? {
        Some(d) => d,
        None => return Ok(()),
    };
    let prev = fetch_hourly(state, monitor_id, region, bucket_hour - chrono::Duration::hours(1)).await?;
    let yday = fetch_hourly(state, monitor_id, region, bucket_hour - chrono::Duration::hours(24)).await?;
    let day_avg = fetch_day_avg(state, monitor_id, region, bucket_hour).await?;

    // cache_hit_pct row
    upsert_baseline_row(
        state, monitor_id, region, bucket_hour, "cache_hit_pct",
        cache_hit_pct(&current), current.total_count,
        prev.as_ref().and_then(cache_hit_pct), prev.as_ref().map(|d| d.total_count).unwrap_or(0),
        yday.as_ref().and_then(cache_hit_pct), yday.as_ref().map(|d| d.total_count).unwrap_or(0),
        day_avg.as_ref().and_then(cache_hit_pct), day_avg.as_ref().map(|d| d.total_count).unwrap_or(0),
    ).await?;

    // ttfb_avg_ms row
    upsert_baseline_row(
        state, monitor_id, region, bucket_hour, "ttfb_avg_ms",
        ttfb_avg_ms(&current), current.sample_count,
        prev.as_ref().and_then(ttfb_avg_ms), prev.as_ref().map(|d| d.sample_count).unwrap_or(0),
        yday.as_ref().and_then(ttfb_avg_ms), yday.as_ref().map(|d| d.sample_count).unwrap_or(0),
        day_avg.as_ref().and_then(ttfb_avg_ms), day_avg.as_ref().map(|d| d.sample_count).unwrap_or(0),
    ).await?;

    Ok(())
}

async fn upsert_global_baselines(
    state: &AppState,
    monitor_id: Uuid,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> Result<(), anyhow::Error> {
    let compute_global = |rows: Vec<(Option<i64>, Option<i64>, Option<f64>, Option<i64>)>| -> Option<HourlyData> {
        let (mut hit, mut total, mut ttfb_sum, mut samples) = (0i64, 0i64, 0f64, 0i64);
        for (h, t, s, sc) in rows {
            hit += h.unwrap_or(0);
            total += t.unwrap_or(0);
            ttfb_sum += s.unwrap_or(0.0);
            samples += sc.unwrap_or(0);
        }
        if total == 0 { None } else {
            Some(HourlyData { hit_count: hit, total_count: total, ttfb_sum_ms: Some(ttfb_sum), sample_count: samples })
        }
    };

    let fetch_global_bucket = |bucket: chrono::DateTime<chrono::Utc>| {
        sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<f64>, Option<i64>)>(
            r#"
            SELECT hit_count::BIGINT, total_count::BIGINT, ttfb_sum_ms, sample_count::BIGINT
            FROM probe_results_hourly
            WHERE monitor_id = $1 AND bucket = $2
            "#,
        )
        .bind(monitor_id)
        .bind(bucket)
        .fetch_all(&state.db)
    };

    let current_rows = fetch_global_bucket(bucket_hour).await?;
    let current = match compute_global(current_rows) {
        Some(d) => d,
        None => return Ok(()),
    };

    let prev_rows = fetch_global_bucket(bucket_hour - chrono::Duration::hours(1)).await?;
    let prev = compute_global(prev_rows);

    let yday_rows = fetch_global_bucket(bucket_hour - chrono::Duration::hours(24)).await?;
    let yday = compute_global(yday_rows);

    // day_avg global: aggregate across all regions for the 24h window.
    // Aggregate queries always return exactly one row (possibly with NULLs), so fetch_one is correct.
    let day_avg_row = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<f64>, Option<i64>)>(
        r#"
        SELECT SUM(hit_count)::BIGINT, SUM(total_count)::BIGINT, SUM(ttfb_sum_ms), SUM(sample_count)::BIGINT
        FROM probe_results_hourly
        WHERE monitor_id = $1
          AND bucket >= $2 - INTERVAL '24 hours'
          AND bucket < $2
        "#,
    )
    .bind(monitor_id)
    .bind(bucket_hour)
    .fetch_one(&state.db)
    .await?;

    let day_avg = {
        let (h, t, s, sc) = day_avg_row;
        if t.unwrap_or(0) == 0 { None } else {
            Some(HourlyData {
                hit_count: h.unwrap_or(0),
                total_count: t.unwrap_or(0),
                ttfb_sum_ms: s,
                sample_count: sc.unwrap_or(0),
            })
        }
    };

    upsert_baseline_row(
        state, monitor_id, "__global__", bucket_hour, "cache_hit_pct",
        cache_hit_pct(&current), current.total_count,
        prev.as_ref().and_then(cache_hit_pct), prev.as_ref().map(|d| d.total_count).unwrap_or(0),
        yday.as_ref().and_then(cache_hit_pct), yday.as_ref().map(|d| d.total_count).unwrap_or(0),
        day_avg.as_ref().and_then(cache_hit_pct), day_avg.as_ref().map(|d| d.total_count).unwrap_or(0),
    ).await?;

    upsert_baseline_row(
        state, monitor_id, "__global__", bucket_hour, "ttfb_avg_ms",
        ttfb_avg_ms(&current), current.sample_count,
        prev.as_ref().and_then(ttfb_avg_ms), prev.as_ref().map(|d| d.sample_count).unwrap_or(0),
        yday.as_ref().and_then(ttfb_avg_ms), yday.as_ref().map(|d| d.sample_count).unwrap_or(0),
        day_avg.as_ref().and_then(ttfb_avg_ms), day_avg.as_ref().map(|d| d.sample_count).unwrap_or(0),
    ).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_data(hit: i64, total: i64, ttfb_sum: f64, samples: i64) -> HourlyData {
        HourlyData { hit_count: hit, total_count: total, ttfb_sum_ms: Some(ttfb_sum), sample_count: samples }
    }

    #[test]
    fn test_cache_hit_pct_normal() {
        let d = make_data(75, 100, 0.0, 0);
        assert!((cache_hit_pct(&d).unwrap() - 75.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_cache_hit_pct_full_hit() {
        let d = make_data(100, 100, 0.0, 0);
        assert!((cache_hit_pct(&d).unwrap() - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_cache_hit_pct_zero_hits() {
        let d = make_data(0, 100, 0.0, 0);
        assert!((cache_hit_pct(&d).unwrap() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_cache_hit_pct_zero_total_returns_none() {
        let d = make_data(0, 0, 0.0, 0);
        assert!(cache_hit_pct(&d).is_none());
    }

    #[test]
    fn test_ttfb_avg_ms_normal() {
        let d = make_data(0, 0, 1500.0, 10);
        assert!((ttfb_avg_ms(&d).unwrap() - 150.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_ttfb_avg_ms_single_sample() {
        let d = make_data(0, 0, 200.0, 1);
        assert!((ttfb_avg_ms(&d).unwrap() - 200.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_ttfb_avg_ms_zero_samples_returns_none() {
        let d = make_data(0, 0, 500.0, 0);
        assert!(ttfb_avg_ms(&d).is_none());
    }

    #[test]
    fn test_ttfb_avg_ms_none_sum_returns_none() {
        let d = HourlyData { hit_count: 0, total_count: 0, ttfb_sum_ms: None, sample_count: 10 };
        assert!(ttfb_avg_ms(&d).is_none());
    }

    #[test]
    fn test_global_cache_hit_pct_weighted() {
        // Region A: 90/100 = 90%. Region B: 10/100 = 10%.
        // Weighted global: 100/200 = 50%. NOT (90+10)/2 = 50% (coincidence).
        // Edge case: Region A: 90/100, Region B: 1/10 → weighted = 91/110 ≈ 82.7%
        let total_hits = 90i64 + 1;
        let total_count = 100i64 + 10;
        let d = HourlyData { hit_count: total_hits, total_count, ttfb_sum_ms: None, sample_count: 0 };
        let expected = 91.0 / 110.0 * 100.0;
        assert!((cache_hit_pct(&d).unwrap() - expected).abs() < 1e-9);
    }

    #[test]
    fn test_global_ttfb_avg_weighted() {
        // Region A: 10 samples, sum 1000ms → avg 100ms. Region B: 1 sample, sum 900ms → avg 900ms.
        // Weighted: 1900/11 ≈ 172.7ms. NOT (100+900)/2 = 500ms.
        let d = make_data(0, 0, 1900.0, 11);
        let expected = 1900.0 / 11.0;
        assert!((ttfb_avg_ms(&d).unwrap() - expected).abs() < 1e-9);
    }
}
