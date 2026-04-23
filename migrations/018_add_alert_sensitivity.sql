-- CacheSnap -- Migration 018: Per-monitor anomaly sensitivity
-- 1 = Low (5σ — only extreme outliers), 2 = Medium (3σ — default), 3 = High (2σ — catches smaller deviations)

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_sensitivity SMALLINT NOT NULL DEFAULT 2;
