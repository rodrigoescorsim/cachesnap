-- Add alert_ttfb_enabled to decouple TTFB threshold alerts from downtime alerts
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_ttfb_enabled BOOLEAN NOT NULL DEFAULT TRUE;
