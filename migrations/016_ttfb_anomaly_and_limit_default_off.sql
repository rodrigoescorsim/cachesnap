-- TTFB Anomaly and TTFB Above Limit off by default.
-- Anomaly requires a stable 7-day baseline to avoid false positives on new monitors.
-- TTFB Above Limit requires a site-specific threshold to be meaningful.
ALTER TABLE monitors ALTER COLUMN alert_ttfb_anomaly_enabled SET DEFAULT FALSE;
ALTER TABLE monitors ALTER COLUMN alert_ttfb_enabled SET DEFAULT FALSE;

UPDATE monitors
SET
  alert_ttfb_anomaly_enabled = FALSE,
  alert_ttfb_enabled         = FALSE;
