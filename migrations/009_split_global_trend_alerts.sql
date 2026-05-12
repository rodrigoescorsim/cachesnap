-- Split global trend alert config into explicit per-metric fields.
-- Removes the generic alert_trend_global_enabled + alert_trend_global_threshold_factor
-- and alert_trend_require_consecutive in favour of four explicit columns.
-- Regional thresholds bumped to match the new 4-hour window sensitivity.

ALTER TABLE monitors
  ADD COLUMN alert_cache_hit_trend_global_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN alert_cache_hit_trend_global_threshold_pp FLOAT   NOT NULL DEFAULT 10.0,
  ADD COLUMN alert_ttfb_trend_global_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN alert_ttfb_trend_global_threshold_pct     FLOAT   NOT NULL DEFAULT 30.0;

ALTER TABLE monitors
  DROP COLUMN alert_trend_global_enabled,
  DROP COLUMN alert_trend_global_threshold_factor,
  DROP COLUMN alert_trend_require_consecutive;

-- Bump regional defaults (4h window requires higher threshold to stay reliable)
ALTER TABLE monitors
  ALTER COLUMN alert_cache_hit_trend_threshold_pp SET DEFAULT 20.0,
  ALTER COLUMN alert_ttfb_trend_threshold_pct     SET DEFAULT 60.0;

-- Migrate existing rows to new defaults
UPDATE monitors SET
  alert_cache_hit_trend_threshold_pp = 20.0,
  alert_ttfb_trend_threshold_pct     = 60.0;
