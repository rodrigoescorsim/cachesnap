-- Stratified TTFB baselines: compare anomaly detection to the same cache stratum
-- (edge HIT vs origin MISS/DYNAMIC/...) when enough 7-day samples exist.

ALTER TABLE monitor_baselines
    ADD COLUMN IF NOT EXISTS ttfb_hit_avg_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ttfb_hit_stddev_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ttfb_hit_sample_count INTEGER,
    ADD COLUMN IF NOT EXISTS ttfb_miss_avg_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ttfb_miss_stddev_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ttfb_miss_sample_count INTEGER;
