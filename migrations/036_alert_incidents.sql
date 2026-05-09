-- Alert Incidents: track open/closed alert lifecycle for smart cooldown & deduplication
CREATE TABLE alert_incidents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id          UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    alert_type          TEXT NOT NULL,
    severity            TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),

    affected_regions    TEXT[] NOT NULL DEFAULT '{}',

    -- Latest detection values snapshot (for digest notifications)
    last_actual         FLOAT,
    last_threshold      FLOAT,

    -- Lifecycle
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_notified_at    TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,

    notification_count  INT NOT NULL DEFAULT 0,

    -- User-controlled snooze
    snoozed_until       TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce only one open incident per (monitor, type)
CREATE UNIQUE INDEX alert_incidents_open_uniq
    ON alert_incidents (monitor_id, alert_type)
    WHERE resolved_at IS NULL;

-- Fast lookup of open incidents by monitor
CREATE INDEX alert_incidents_monitor_open
    ON alert_incidents (monitor_id, opened_at DESC)
    WHERE resolved_at IS NULL;

-- Used by worker to find incidents to resolve
CREATE INDEX alert_incidents_monitor_type
    ON alert_incidents (monitor_id, alert_type, resolved_at);
