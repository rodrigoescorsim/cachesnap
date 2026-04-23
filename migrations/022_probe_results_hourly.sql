CREATE MATERIALIZED VIEW IF NOT EXISTS probe_results_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time)                                                AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (
        WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING')
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
