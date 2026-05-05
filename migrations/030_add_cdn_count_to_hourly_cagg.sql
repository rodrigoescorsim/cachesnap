-- Migration 030: Add cdn_count to hourly continuous aggregates
-- Refined to exclude BYPASS and other non-cacheable statuses from the CDN count.
-- This ensures that sites intentionally bypassing cache don't trigger "Low Cache Rate" alerts.

-- 1. Remove policies and drop view for cache_hits_hourly
DO $$ BEGIN PERFORM remove_continuous_aggregate_policy('cache_hits_hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DROP MATERIALIZED VIEW IF EXISTS cache_hits_hourly;

CREATE MATERIALIZED VIEW cache_hits_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')) AS hit_count,
    -- cdn_count only includes samples that are either a HIT or a MISS (cacheable traffic)
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS')) AS cdn_count,
    COUNT(*) AS total_count
FROM probe_results
WHERE error IS NULL AND status_code < 500
GROUP BY bucket, monitor_id, region
WITH NO DATA;

SELECT add_continuous_aggregate_policy('cache_hits_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 hour');

-- 2. Remove policies and drop view for probe_results_hourly
DO $$ BEGIN PERFORM remove_continuous_aggregate_policy('probe_results_hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DROP MATERIALIZED VIEW IF EXISTS probe_results_hourly;

CREATE MATERIALIZED VIEW probe_results_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time)                                                AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')) AS hit_count,
    -- cdn_count only includes samples that are either a HIT or a MISS (cacheable traffic)
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS')) AS cdn_count,
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
