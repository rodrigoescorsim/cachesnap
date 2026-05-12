-- Per-monitor cache hit thresholds (warn = amber, critical = red)
-- alert_cache_hit_threshold_pct repurposed as the warn boundary (was: alert trigger at 50%)
ALTER TABLE monitors
  ALTER COLUMN alert_cache_hit_threshold_pct SET DEFAULT 80.0;

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS cache_hit_critical_pct FLOAT NOT NULL DEFAULT 50.0;
