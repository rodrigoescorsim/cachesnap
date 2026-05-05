-- Migration 031: Proactive Alert Defaults
-- Setting conservative but comprehensive defaults for all alert types.

ALTER TABLE monitors
  ALTER COLUMN alert_cache_hit_trend_threshold_pct SET DEFAULT 30,
  ALTER COLUMN alert_ttfb_trend_threshold_pct SET DEFAULT 30,
  ALTER COLUMN alert_ttfb_enabled SET DEFAULT true,
  ALTER COLUMN alert_down_enabled SET DEFAULT true,
  ALTER COLUMN alert_anomaly_enabled SET DEFAULT true,
  ALTER COLUMN alert_anycast_enabled SET DEFAULT true,
  ALTER COLUMN alert_zombie_cache_enabled SET DEFAULT true,
  ALTER COLUMN alert_cache_hit_enabled SET DEFAULT true,
  ALTER COLUMN alert_cache_hit_threshold_pct SET DEFAULT 50,
  ALTER COLUMN alert_cache_hit_trend_enabled SET DEFAULT true,
  ALTER COLUMN alert_ttfb_trend_enabled SET DEFAULT true,
  ALTER COLUMN alert_cache_hit_trend_comparators SET DEFAULT ARRAY['prev_hour', 'same_hour_prev_day', 'day_avg'],
  ALTER COLUMN alert_ttfb_trend_comparators SET DEFAULT ARRAY['prev_hour', 'same_hour_prev_day', 'day_avg'];
