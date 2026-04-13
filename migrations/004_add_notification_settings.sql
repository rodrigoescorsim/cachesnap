-- Notification settings per monitor
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS notify_email         TEXT,
  ADD COLUMN IF NOT EXISTS notify_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notify_slack_webhook TEXT,
  ADD COLUMN IF NOT EXISTS notify_slack_enabled BOOLEAN NOT NULL DEFAULT FALSE;
