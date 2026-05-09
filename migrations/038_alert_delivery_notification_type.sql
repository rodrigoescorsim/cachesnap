-- Track notification type for observability KPIs (first_fire vs digest vs recovery ratio)
ALTER TABLE ops_alert_delivery_stats
    ADD COLUMN notification_type TEXT NOT NULL DEFAULT 'first_fire'
        CHECK (notification_type IN ('first_fire', 'digest', 'recovery'));
