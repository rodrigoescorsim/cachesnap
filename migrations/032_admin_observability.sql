-- Migration 032: Admin Observability Foundation
-- Adds admin role, audit log, ops hypertables, and internal probe incident tracking.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin_internal BOOLEAN NOT NULL DEFAULT false;

-- Audit log for admin endpoint access (hypertable with 180-day retention)
CREATE TABLE IF NOT EXISTS admin_access_log (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     UUID        NOT NULL,
  endpoint    TEXT        NOT NULL,
  ip          TEXT
);
SELECT create_hypertable('admin_access_log', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('admin_access_log', INTERVAL '180 days', if_not_exists => TRUE);

-- Internal probe incidents (operational tracking, not customer-visible)
CREATE TABLE IF NOT EXISTS internal_probe_incidents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id       UUID        NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  region           TEXT        NOT NULL,
  error_signature  TEXT        NOT NULL,
  sample_error     TEXT,
  probe_version    TEXT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrence_count INT         NOT NULL DEFAULT 1,
  severity         TEXT        NOT NULL CHECK (severity IN ('warning', 'critical')),
  status           TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  last_notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_probe_incidents_open
  ON internal_probe_incidents(region, last_seen_at DESC) WHERE status = 'open';

-- ── Ops aggregation tables ────────────────────────────────────────────────────
-- Populated by background workers. Queries fall back to probe_results when empty.

CREATE TABLE IF NOT EXISTS ops_ingest_minute_stats (
  time          TIMESTAMPTZ NOT NULL,
  region        TEXT        NOT NULL,
  success_count INT         NOT NULL DEFAULT 0,
  fail_count    INT         NOT NULL DEFAULT 0,
  fail_reason   TEXT
);
SELECT create_hypertable('ops_ingest_minute_stats', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ops_ingest_region ON ops_ingest_minute_stats(region, time DESC);
SELECT add_retention_policy('ops_ingest_minute_stats', INTERVAL '30 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS ops_probe_region_stats (
  time          TIMESTAMPTZ NOT NULL,
  region        TEXT        NOT NULL,
  probe_count   INT         NOT NULL DEFAULT 0,
  avg_ttfb_ms   NUMERIC,
  p95_ttfb_ms   NUMERIC
);
SELECT create_hypertable('ops_probe_region_stats', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ops_probe_region ON ops_probe_region_stats(region, time DESC);
SELECT add_retention_policy('ops_probe_region_stats', INTERVAL '30 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS ops_alert_delivery_stats (
  time           TIMESTAMPTZ NOT NULL,
  channel        TEXT        NOT NULL,
  provider       TEXT        NOT NULL,
  success_count  INT         NOT NULL DEFAULT 0,
  fail_count     INT         NOT NULL DEFAULT 0,
  avg_latency_ms NUMERIC
);
SELECT create_hypertable('ops_alert_delivery_stats', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ops_alert_delivery ON ops_alert_delivery_stats(channel, time DESC);
SELECT add_retention_policy('ops_alert_delivery_stats', INTERVAL '90 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS ops_service_heartbeat (
  time       TIMESTAMPTZ NOT NULL,
  service    TEXT        NOT NULL,
  status     TEXT        NOT NULL,
  latency_ms NUMERIC
);
SELECT create_hypertable('ops_service_heartbeat', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ops_service_heartbeat ON ops_service_heartbeat(service, time DESC);
SELECT add_retention_policy('ops_service_heartbeat', INTERVAL '30 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS ops_fleet_version_map (
  time               TIMESTAMPTZ NOT NULL,
  region             TEXT        NOT NULL,
  version            TEXT        NOT NULL,
  deploy_age_seconds BIGINT
);
SELECT create_hypertable('ops_fleet_version_map', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ops_fleet_version ON ops_fleet_version_map(region, time DESC);
SELECT add_retention_policy('ops_fleet_version_map', INTERVAL '90 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS ops_tenant_activity_daily (
  time          TIMESTAMPTZ NOT NULL,
  tenant_id     UUID        NOT NULL,
  probe_count   INT         NOT NULL DEFAULT 0,
  monitor_count INT         NOT NULL DEFAULT 0
);
SELECT create_hypertable('ops_tenant_activity_daily', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ops_tenant_activity ON ops_tenant_activity_daily(tenant_id, time DESC);
SELECT add_retention_policy('ops_tenant_activity_daily', INTERVAL '180 days', if_not_exists => TRUE);
ALTER TABLE ops_tenant_activity_daily SET (timescaledb.compress, timescaledb.compress_segmentby = 'tenant_id');
SELECT add_compression_policy('ops_tenant_activity_daily', COMPRESS_AFTER => INTERVAL '7 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS ops_slo_snapshot (
  time                            TIMESTAMPTZ NOT NULL,
  probe_on_time_rate              NUMERIC,
  ingest_success_rate             NUMERIC,
  notify_delivery_rate            NUMERIC,
  probe_schedule_delay_p50_seconds NUMERIC,
  window_minutes                  INT         NOT NULL DEFAULT 15
);
SELECT create_hypertable('ops_slo_snapshot', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('ops_slo_snapshot', INTERVAL '180 days', if_not_exists => TRUE);
ALTER TABLE ops_slo_snapshot SET (timescaledb.compress);
SELECT add_compression_policy('ops_slo_snapshot', COMPRESS_AFTER => INTERVAL '7 days', if_not_exists => TRUE);
