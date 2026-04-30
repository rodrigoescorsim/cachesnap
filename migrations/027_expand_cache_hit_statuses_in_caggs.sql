-- Migration 027: expand cache-hit status list in continuous aggregates.
-- This migration is needed because migrations 020 and 022 were already applied
-- in existing environments and cannot be edited in place.

-- ── cache_hits_hourly ────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM remove_continuous_aggregate_policy('cache_hits_hourly');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM remove_retention_policy('cache_hits_hourly');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DROP MATERIALIZED VIEW IF EXISTS cache_hits_hourly;

CREATE MATERIALIZED VIEW cache_hits_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')) AS hit_count,
    COUNT(*) AS total_count
FROM probe_results
WHERE error IS NULL AND status_code < 500
GROUP BY bucket, monitor_id, region
WITH NO DATA;

SELECT add_continuous_aggregate_policy('cache_hits_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 hour');

SELECT add_retention_policy('cache_hits_hourly', INTERVAL '30 days');

-- ── probe_results_hourly ─────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM remove_continuous_aggregate_policy('probe_results_hourly');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM remove_retention_policy('probe_results_hourly');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DROP MATERIALIZED VIEW IF EXISTS probe_results_hourly;

CREATE MATERIALIZED VIEW probe_results_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time)                                                AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (
        WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')
    )                                                                          AS hit_count,
    COUNT(*)                                                                   AS total_count,
    SUM(ttfb_ms)                                                               AS ttfb_sum_ms,
    COUNT(ttfb_ms)                                                             AS sample_count
FROM probe_results
WHERE error IS NULL AND status_code < 500
GROUP BY bucket, monitor_id, region
WITH NO DATA;

SELECT add_continuous_aggregate_policy('probe_results_hourly',
    start_offset      => INTERVAL '3 hours',
    end_offset        => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 hour');

SELECT add_retention_policy('probe_results_hourly', INTERVAL '90 days');
