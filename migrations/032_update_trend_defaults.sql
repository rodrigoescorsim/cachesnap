-- Migration 032: Update Trend Alert Defaults
-- Increasing default trend thresholds from 30% to 40% based on user feedback to reduce noise.

ALTER TABLE monitors
  ALTER COLUMN alert_cache_hit_trend_threshold_pct SET DEFAULT 40,
  ALTER COLUMN alert_ttfb_trend_threshold_pct SET DEFAULT 40;

-- Update existing monitors that are using the old default (30) to the new default (40)
UPDATE monitors
SET alert_cache_hit_trend_threshold_pct = 40
WHERE alert_cache_hit_trend_threshold_pct = 30;

UPDATE monitors
SET alert_ttfb_trend_threshold_pct = 40
WHERE alert_ttfb_trend_threshold_pct = 30;
