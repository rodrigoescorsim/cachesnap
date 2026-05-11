-- Store provider failure details for notification delivery debugging.
ALTER TABLE ops_alert_delivery_stats
    ADD COLUMN IF NOT EXISTS error_message TEXT;
