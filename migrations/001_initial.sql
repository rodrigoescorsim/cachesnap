-- CacheSnap — Migration inicial
-- Executada automaticamente pelo sqlx na inicialização da API Rust

-- ── Extensão TimescaleDB ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Usuários ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT        UNIQUE NOT NULL,
    password_hash TEXT      NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sessões NextAuth (self-hosted) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id            UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
    session_token TEXT  UNIQUE NOT NULL,
    user_id       UUID  REFERENCES users(id) ON DELETE CASCADE,
    expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    UNIQUE(provider, provider_account_id)
);

-- ── Monitors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitors (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               UUID        REFERENCES users(id) ON DELETE CASCADE,
    url                   TEXT        NOT NULL,
    name                  TEXT,
    check_interval_seconds INT        DEFAULT 300,
    alert_threshold_ms    INT         DEFAULT 1000,
    is_active             BOOLEAN     DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Resultados dos probes (hypertable TimescaleDB) ────────────────────────────
CREATE TABLE IF NOT EXISTS probe_results (
    time             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monitor_id       UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    region           TEXT        NOT NULL,
    ttfb_ms          FLOAT,
    download_ms      FLOAT,
    total_ms         FLOAT,
    dns_ms           FLOAT,      -- null no Phase 1 (CF Workers); preenchido pelos Node.js probes
    tls_ms           FLOAT,      -- null no Phase 1 (CF Workers); preenchido pelos Node.js probes
    status_code      INT,
    cache_status     TEXT,       -- CF-Cache-Status / X-Vercel-Cache / X-Cache
    served_by        TEXT,       -- CF-Ray / X-Served-By
    server_timing    TEXT,       -- header bruto para parsing posterior
    http_version     TEXT,
    redirect_count   INT,
    content_length   BIGINT,
    error            TEXT
);

SELECT create_hypertable('probe_results', 'time', if_not_exists => TRUE);

-- Compressão automática após 7 dias
ALTER TABLE probe_results SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'monitor_id, region'
);
SELECT add_compression_policy('probe_results', INTERVAL '7 days', if_not_exists => TRUE);

-- Índices para queries frequentes do dashboard
CREATE INDEX IF NOT EXISTS idx_probe_results_monitor_time
    ON probe_results (monitor_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_probe_results_monitor_region_time
    ON probe_results (monitor_id, region, time DESC);

-- ── Baselines por monitor × região ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_baselines (
    monitor_id     UUID   REFERENCES monitors(id) ON DELETE CASCADE,
    region         TEXT   NOT NULL,
    ttfb_avg_ms    FLOAT,
    ttfb_stddev_ms FLOAT,
    cache_hit_rate FLOAT,
    sample_count   INT,
    calculated_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (monitor_id, region)
);

-- ── Alertas disparados ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    monitor_id       UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    region           TEXT        NOT NULL,
    alert_type       TEXT        NOT NULL, -- 'anomaly' | 'threshold' | 'ssl_expiry' | 'down'
    metric           TEXT        NOT NULL,
    baseline_ms      FLOAT,
    actual_ms        FLOAT,
    deviation_factor FLOAT,                -- ex: 2.4 = "2.4x mais lento que o normal"
    diagnosis        TEXT,                 -- gerado pelo engine de diagnóstico
    action           TEXT,                 -- ação recomendada
    notified_email   BOOLEAN     DEFAULT FALSE,
    notified_slack   BOOLEAN     DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
