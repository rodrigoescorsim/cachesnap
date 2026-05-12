-- CacheSnap — Schema consolidado
-- Fonte única de verdade para todo o schema do banco.
-- Substitui as 43 migrations incrementais anteriores.

-- ── Extensões ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Usuários & Auth ───────────────────────────────────────────────────────────
CREATE TABLE users (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    email         TEXT        UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    is_admin_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id            UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
    session_token TEXT  UNIQUE NOT NULL,
    user_id       UUID  REFERENCES users(id) ON DELETE CASCADE,
    expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE accounts (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    UNIQUE (provider, provider_account_id)
);

-- ── Regiões ───────────────────────────────────────────────────────────────────
CREATE TABLE regions (
    id          TEXT        PRIMARY KEY,
    label       TEXT        NOT NULL,
    description TEXT        NOT NULL,
    color       TEXT        NOT NULL DEFAULT '#6b7280',
    lambda_url  TEXT        NOT NULL DEFAULT '',
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO regions (id, label, description, color, lambda_url) VALUES
    ('sa-east',  'São Paulo',  'South America — AWS sa-east-1 (São Paulo, BR)',  '#f59e0b', 'https://<function-url-id>.lambda-url.sa-east-1.on.aws/'),
    ('eu-west',  'Frankfurt',  'Europe — AWS eu-central-1 (Frankfurt, DE)',       '#3b82f6', 'https://<function-url-id>.lambda-url.eu-central-1.on.aws/'),
    ('us-east',  'Ohio',       'US East — AWS us-east-2 (Ohio, US)',              '#10b981', 'https://<function-url-id>.lambda-url.us-east-2.on.aws/'),
    ('us-west',  'Oregon',     'US West — AWS us-west-2 (Oregon, US)',            '#f97316', 'https://<function-url-id>.lambda-url.us-west-2.on.aws/'),
    ('ap-east',  'Tokyo',      'Asia Pacific — AWS ap-northeast-1 (Tokyo, JP)',   '#8b5cf6', 'https://<function-url-id>.lambda-url.ap-northeast-1.on.aws/'),
    ('ap-south', 'Mumbai',     'India — AWS ap-south-1 (Mumbai, IN)',             '#ec4899', 'https://<function-url-id>.lambda-url.ap-south-1.on.aws/'),
    ('oc',       'Sydney',     'Oceania — AWS ap-southeast-2 (Sydney, AU)',       '#f43f5e', 'https://<function-url-id>.lambda-url.ap-southeast-2.on.aws/'),
    ('af-south', 'Cape Town',  'Africa — AWS af-south-1 (Cape Town, ZA)',         '#a855f7', 'https://<function-url-id>.lambda-url.af-south-1.on.aws/')
ON CONFLICT (id) DO NOTHING;

-- ── Monitors ──────────────────────────────────────────────────────────────────
CREATE TABLE monitors (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        REFERENCES users(id) ON DELETE CASCADE,
    url           TEXT        NOT NULL,
    name          TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),

    -- Frequências
    check_interval_seconds  INT NOT NULL DEFAULT 300,
    audit_interval_seconds  INT NOT NULL DEFAULT 3600,

    -- Thresholds de TTFB
    alert_threshold_ms      INT NOT NULL DEFAULT 1500,
    alert_threshold_hit_ms  INT NOT NULL DEFAULT 500,
    alert_sensitivity       SMALLINT NOT NULL DEFAULT 2,

    -- Notificações
    notify_email            TEXT,
    notify_email_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    notify_slack_webhook    TEXT,
    notify_slack_enabled    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Alertas por tipo
    alert_down_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    alert_ttfb_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    alert_ttfb_anomaly_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    alert_anycast_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    alert_cache_age_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    alert_cache_age_threshold_hours INT     NOT NULL DEFAULT 72,
    alert_cache_hit_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    alert_cache_hit_threshold_pct   FLOAT   NOT NULL DEFAULT 50.0,

    -- Alertas de tendência
    alert_cache_hit_trend_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    alert_cache_hit_trend_threshold_pct     FLOAT   NOT NULL DEFAULT 40.0,
    alert_cache_hit_trend_comparators       TEXT[]  NOT NULL DEFAULT ARRAY['prev_hour', 'same_hour_prev_day', 'day_avg'],
    alert_ttfb_trend_enabled                BOOLEAN NOT NULL DEFAULT TRUE,
    alert_ttfb_trend_threshold_pct          FLOAT   NOT NULL DEFAULT 40.0,
    alert_ttfb_trend_comparators            TEXT[]  NOT NULL DEFAULT ARRAY['prev_hour', 'same_hour_prev_day', 'day_avg'],
    alert_ttfb_trend_direction              TEXT    NOT NULL DEFAULT 'worsening',
    alert_trend_min_samples                 INT     NOT NULL DEFAULT 3,
    alert_trend_cooldown_minutes            INT     NOT NULL DEFAULT 60,
    alert_trend_require_consecutive         BOOLEAN NOT NULL DEFAULT FALSE,
    alert_trend_global_enabled              BOOLEAN NOT NULL DEFAULT FALSE,
    alert_trend_global_threshold_factor     FLOAT   NOT NULL DEFAULT 1.5,

    -- Audit readiness
    audit_readiness_state               TEXT  NOT NULL DEFAULT 'disabled',
    audit_readiness_updated_at          TIMESTAMPTZ,
    audit_readiness_consecutive_hits    INT   NOT NULL DEFAULT 0,
    audit_readiness_reason              TEXT,
    audit_readiness_comparable_pairs    INT   NOT NULL DEFAULT 0,
    audit_readiness_comparable_regions  INT   NOT NULL DEFAULT 0,
    audit_readiness_edge_hit_ratio      FLOAT NOT NULL DEFAULT 0,

    CONSTRAINT unique_user_monitor_url UNIQUE (user_id, url)
);

-- ── Resultados dos probes (hypertable) ────────────────────────────────────────
CREATE TABLE probe_results (
    time                    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    monitor_id              UUID            REFERENCES monitors(id) ON DELETE CASCADE,
    region                  TEXT            NOT NULL,
    ttfb_ms                 FLOAT,
    download_ms             FLOAT,
    total_ms                FLOAT,
    dns_ms                  FLOAT,
    tcp_ms                  DOUBLE PRECISION,
    tls_ms                  FLOAT,
    edge_ms                 FLOAT,
    origin_ms               FLOAT,
    status_code             INT,
    cache_status            TEXT,
    served_by               TEXT,
    cdn_provider            TEXT,
    server_timing           TEXT,
    http_version            TEXT,
    redirect_count          INT,
    content_length          BIGINT,
    error                   TEXT,
    age_s                   INT,
    security_headers        JSONB,
    server_timing_breakdown JSONB,
    is_manual               BOOLEAN         NOT NULL DEFAULT FALSE,
    probe_version           TEXT,
    scheduled_at            TIMESTAMPTZ
);

SELECT create_hypertable('probe_results', 'time', if_not_exists => TRUE);

ALTER TABLE probe_results SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'monitor_id, region'
);
SELECT add_compression_policy('probe_results', INTERVAL '7 days', if_not_exists => TRUE);

CREATE INDEX idx_probe_results_monitor_time        ON probe_results (monitor_id, time DESC);
CREATE INDEX idx_probe_results_monitor_region_time ON probe_results (monitor_id, region, time DESC);
CREATE INDEX idx_probe_results_scheduled_at        ON probe_results (scheduled_at DESC) WHERE scheduled_at IS NOT NULL;

-- ── Resultados de audit/bypass (hypertable) ───────────────────────────────────
CREATE TABLE audit_results (
    time                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monitor_id              UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    region                  TEXT        NOT NULL,
    origin_ttfb_ms          FLOAT,
    origin_total_ms         FLOAT,
    edge_ttfb_ms            FLOAT,
    edge_total_ms           FLOAT,
    origin_dns_ms           FLOAT,
    origin_tcp_ms           FLOAT,
    origin_tls_ms           FLOAT,
    edge_dns_ms             FLOAT,
    edge_tcp_ms             FLOAT,
    edge_tls_ms             FLOAT,
    origin_status_code      INT,
    origin_error            TEXT,
    origin_served_by        TEXT,
    edge_status_code        INT,
    edge_cache_status       TEXT,
    edge_served_by          TEXT,
    content_length          BIGINT,
    is_manual               BOOLEAN     DEFAULT FALSE,
    probe_version           TEXT,
    server_timing_breakdown JSONB,
    origin_cache_status     TEXT,
    origin_age_s            INT
);

SELECT create_hypertable('audit_results', 'time', if_not_exists => TRUE);

CREATE INDEX idx_audit_results_monitor_time        ON audit_results (monitor_id, time DESC);
CREATE INDEX idx_audit_results_monitor_region_time ON audit_results (monitor_id, region, time DESC);

-- ── Baselines por monitor × região ───────────────────────────────────────────
CREATE TABLE monitor_baselines (
    monitor_id     UUID  REFERENCES monitors(id) ON DELETE CASCADE,
    region         TEXT  NOT NULL,
    ttfb_avg_ms    FLOAT,
    ttfb_stddev_ms FLOAT,
    cache_hit_rate FLOAT,
    sample_count   INT,
    calculated_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (monitor_id, region)
);

-- ── Baselines de tendência ────────────────────────────────────────────────────
CREATE TABLE trend_baselines (
    monitor_id             UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    region                 TEXT        NOT NULL,
    bucket_hour            TIMESTAMPTZ NOT NULL,
    metric                 TEXT        NOT NULL,
    current_value          FLOAT,
    current_samples        INT,
    prev_hour_value        FLOAT,
    prev_hour_samples      INT,
    same_hour_yday_value   FLOAT,
    same_hour_yday_samples INT,
    day_avg_value          FLOAT,
    day_avg_samples        INT,
    computed_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (monitor_id, region, bucket_hour, metric)
);

CREATE INDEX idx_trend_baselines_lookup ON trend_baselines (monitor_id, region, metric, bucket_hour DESC);

-- ── Transições de estado de readiness ────────────────────────────────────────
CREATE TABLE audit_state_transitions (
    id         BIGSERIAL   PRIMARY KEY,
    monitor_id UUID        NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    from_state TEXT        NOT NULL,
    to_state   TEXT        NOT NULL,
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ast_monitor_time ON audit_state_transitions (monitor_id, created_at DESC);

-- ── Incidentes de alerta ──────────────────────────────────────────────────────
CREATE TABLE alert_incidents (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id          UUID        NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    alert_type          TEXT        NOT NULL,
    severity            TEXT        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    affected_regions    TEXT[]      NOT NULL DEFAULT '{}',
    last_actual         FLOAT,
    last_threshold      FLOAT,
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_notified_at    TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    notification_count  INT         NOT NULL DEFAULT 0,
    snoozed_until       TIMESTAMPTZ,
    diagnosis           TEXT,
    action              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX alert_incidents_open_uniq ON alert_incidents (monitor_id, alert_type) WHERE resolved_at IS NULL;
CREATE INDEX alert_incidents_monitor_open     ON alert_incidents (monitor_id, opened_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX alert_incidents_monitor_type     ON alert_incidents (monitor_id, alert_type, resolved_at);

-- ── Histórico de alertas disparados ──────────────────────────────────────────
CREATE TABLE alerts (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    monitor_id       UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    incident_id      UUID        REFERENCES alert_incidents(id) ON DELETE SET NULL,
    region           TEXT        NOT NULL,
    alert_type       TEXT        NOT NULL,
    metric           TEXT        NOT NULL,
    baseline_ms      FLOAT,
    actual_ms        FLOAT,
    deviation_factor FLOAT,
    diagnosis        TEXT,
    action           TEXT,
    estimated_gain_ms FLOAT,
    comparator       TEXT,
    scope            TEXT,
    delta_pct        FLOAT,
    sample_count     INT,
    notified_email   BOOLEAN     DEFAULT FALSE,
    notified_slack   BOOLEAN     DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX alerts_incident_id_idx ON alerts (incident_id) WHERE incident_id IS NOT NULL;

-- ── Admin & Observabilidade Interna ───────────────────────────────────────────
CREATE TABLE admin_access_log (
    time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id  UUID        NOT NULL,
    endpoint TEXT        NOT NULL,
    ip       TEXT
);
SELECT create_hypertable('admin_access_log', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('admin_access_log', INTERVAL '180 days', if_not_exists => TRUE);

CREATE TABLE internal_probe_incidents (
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

CREATE INDEX idx_probe_incidents_open ON internal_probe_incidents (region, last_seen_at DESC) WHERE status = 'open';

CREATE TABLE ops_ingest_minute_stats (
    time          TIMESTAMPTZ NOT NULL,
    region        TEXT        NOT NULL,
    success_count INT         NOT NULL DEFAULT 0,
    fail_count    INT         NOT NULL DEFAULT 0,
    fail_reason   TEXT
);
SELECT create_hypertable('ops_ingest_minute_stats', 'time', if_not_exists => TRUE);
CREATE INDEX idx_ops_ingest_region ON ops_ingest_minute_stats (region, time DESC);
SELECT add_retention_policy('ops_ingest_minute_stats', INTERVAL '30 days', if_not_exists => TRUE);

CREATE TABLE ops_probe_region_stats (
    time         TIMESTAMPTZ NOT NULL,
    region       TEXT        NOT NULL,
    probe_count  INT         NOT NULL DEFAULT 0,
    avg_ttfb_ms  NUMERIC,
    p95_ttfb_ms  NUMERIC
);
SELECT create_hypertable('ops_probe_region_stats', 'time', if_not_exists => TRUE);
CREATE INDEX idx_ops_probe_region ON ops_probe_region_stats (region, time DESC);
SELECT add_retention_policy('ops_probe_region_stats', INTERVAL '30 days', if_not_exists => TRUE);

CREATE TABLE ops_alert_delivery_stats (
    time              TIMESTAMPTZ NOT NULL,
    channel           TEXT        NOT NULL,
    provider          TEXT        NOT NULL,
    success_count     INT         NOT NULL DEFAULT 0,
    fail_count        INT         NOT NULL DEFAULT 0,
    avg_latency_ms    NUMERIC,
    notification_type TEXT        NOT NULL DEFAULT 'first_fire'
        CHECK (notification_type IN ('first_fire', 'digest', 'recovery')),
    error_message     TEXT
);
SELECT create_hypertable('ops_alert_delivery_stats', 'time', if_not_exists => TRUE);
CREATE INDEX idx_ops_alert_delivery ON ops_alert_delivery_stats (channel, time DESC);
SELECT add_retention_policy('ops_alert_delivery_stats', INTERVAL '90 days', if_not_exists => TRUE);

CREATE TABLE ops_service_heartbeat (
    time       TIMESTAMPTZ NOT NULL,
    service    TEXT        NOT NULL,
    status     TEXT        NOT NULL,
    latency_ms NUMERIC
);
SELECT create_hypertable('ops_service_heartbeat', 'time', if_not_exists => TRUE);
CREATE INDEX idx_ops_service_heartbeat ON ops_service_heartbeat (service, time DESC);
SELECT add_retention_policy('ops_service_heartbeat', INTERVAL '30 days', if_not_exists => TRUE);

CREATE TABLE ops_fleet_version_map (
    time               TIMESTAMPTZ NOT NULL,
    region             TEXT        NOT NULL,
    version            TEXT        NOT NULL,
    deploy_age_seconds BIGINT
);
SELECT create_hypertable('ops_fleet_version_map', 'time', if_not_exists => TRUE);
CREATE INDEX idx_ops_fleet_version ON ops_fleet_version_map (region, time DESC);
SELECT add_retention_policy('ops_fleet_version_map', INTERVAL '90 days', if_not_exists => TRUE);

CREATE TABLE ops_tenant_activity_daily (
    time          TIMESTAMPTZ NOT NULL,
    tenant_id     UUID        NOT NULL,
    probe_count   INT         NOT NULL DEFAULT 0,
    monitor_count INT         NOT NULL DEFAULT 0
);
SELECT create_hypertable('ops_tenant_activity_daily', 'time', if_not_exists => TRUE);
CREATE INDEX idx_ops_tenant_activity ON ops_tenant_activity_daily (tenant_id, time DESC);
SELECT add_retention_policy('ops_tenant_activity_daily', INTERVAL '180 days', if_not_exists => TRUE);
ALTER TABLE ops_tenant_activity_daily SET (timescaledb.compress, timescaledb.compress_segmentby = 'tenant_id');
SELECT add_compression_policy('ops_tenant_activity_daily', COMPRESS_AFTER => INTERVAL '7 days', if_not_exists => TRUE);

CREATE TABLE ops_slo_snapshot (
    time                             TIMESTAMPTZ NOT NULL,
    probe_on_time_rate               NUMERIC,
    ingest_success_rate              NUMERIC,
    notify_delivery_rate             NUMERIC,
    probe_schedule_delay_p50_seconds NUMERIC,
    window_minutes                   INT         NOT NULL DEFAULT 15
);
SELECT create_hypertable('ops_slo_snapshot', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('ops_slo_snapshot', INTERVAL '180 days', if_not_exists => TRUE);
ALTER TABLE ops_slo_snapshot SET (timescaledb.compress);
SELECT add_compression_policy('ops_slo_snapshot', COMPRESS_AFTER => INTERVAL '7 days', if_not_exists => TRUE);

-- ── Continuous Aggregates ─────────────────────────────────────────────────────
-- cache_hits_hourly: usado para alertas de cache hit rate
CREATE MATERIALIZED VIEW cache_hits_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')) AS hit_count,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS')) AS cdn_count,
    COUNT(*) AS total_count
FROM probe_results
WHERE error IS NULL AND status_code < 500
GROUP BY bucket, monitor_id, region
WITH NO DATA;

SELECT add_continuous_aggregate_policy('cache_hits_hourly',
    start_offset      => INTERVAL '3 hours',
    end_offset        => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 hour');

SELECT add_retention_policy('cache_hits_hourly', INTERVAL '30 days');

-- probe_results_hourly: usado para alertas de TTFB e cache hit combinados
CREATE MATERIALIZED VIEW probe_results_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')) AS hit_count,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS')) AS cdn_count,
    COUNT(*)                                                                   AS total_count,
    SUM(ttfb_ms)                                                               AS ttfb_sum_ms,
    COUNT(ttfb_ms)                                                             AS sample_count
FROM probe_results
WHERE error IS NULL AND status_code < 500
GROUP BY bucket, monitor_id, region
WITH NO DATA;

SELECT add_continuous_aggregate_policy('probe_results_hourly',
    start_offset      => INTERVAL '3 hours',
    end_offset        => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 hour');

SELECT add_retention_policy('probe_results_hourly', INTERVAL '90 days');
