-- Generic webhook notification channel per monitor.
-- Sends a versioned JSON payload to any HTTPS endpoint (Zapier, n8n, Make, PagerDuty, custom scripts).
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS notify_webhook_url     TEXT,
  ADD COLUMN IF NOT EXISTS notify_webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS notified_webhook BOOLEAN NOT NULL DEFAULT FALSE;
