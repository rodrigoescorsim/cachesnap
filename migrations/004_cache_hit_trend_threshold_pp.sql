-- Cache Hit Drop trend: threshold is percentage points (pp) of hit-rate drop, not relative %.
-- Renames column and maps legacy relative-style values (e.g. 40) to sensible pp (default scale 10).

ALTER TABLE monitors
    RENAME COLUMN alert_cache_hit_trend_threshold_pct TO alert_cache_hit_trend_threshold_pp;

-- Legacy values were typically 15–100 as a "relative %" sensitivity; map to pp via /4 with bounds.
UPDATE monitors
SET alert_cache_hit_trend_threshold_pp = LEAST(
        50::double precision,
        GREATEST(2::double precision, ROUND(alert_cache_hit_trend_threshold_pp / 4.0))
    );

ALTER TABLE monitors
    ALTER COLUMN alert_cache_hit_trend_threshold_pp SET DEFAULT 10;
