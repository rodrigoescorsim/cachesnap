-- Cache Hit Drop trend: threshold is percentage points (pp) of hit-rate drop, not relative %.
-- Renames column if it still has the old _pct name; no-op if already renamed in the initial schema.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'monitors'
          AND column_name = 'alert_cache_hit_trend_threshold_pct'
    ) THEN
        ALTER TABLE monitors
            RENAME COLUMN alert_cache_hit_trend_threshold_pct TO alert_cache_hit_trend_threshold_pp;
        UPDATE monitors
        SET alert_cache_hit_trend_threshold_pp = LEAST(
                50::double precision,
                GREATEST(2::double precision, ROUND(alert_cache_hit_trend_threshold_pp / 4.0))
            );
    END IF;
END $$;

ALTER TABLE monitors
    ALTER COLUMN alert_cache_hit_trend_threshold_pp SET DEFAULT 10;
