-- Add differentiated TTFB thresholds for Cache HIT and MISS
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_threshold_ms INT NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS alert_threshold_hit_ms INT NOT NULL DEFAULT 500;
