-- HopLens -- Migration 009: Infrastructure Audit Table
-- Stores high-fidelity Edge vs Origin comparisons separately from natural monitoring probes.

CREATE TABLE IF NOT EXISTS audit_results (
    time             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monitor_id       UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    region           TEXT        NOT NULL,
    
    -- Performance Comparison
    origin_ttfb_ms   FLOAT,
    origin_total_ms  FLOAT,
    edge_ttfb_ms     FLOAT,
    edge_total_ms    FLOAT,
    
    -- Connectivity Diagnostics (Currently null for CF Workers, but schema ready)
    origin_dns_ms    FLOAT,
    origin_tcp_ms    FLOAT,
    origin_tls_ms    FLOAT,
    edge_dns_ms      FLOAT,
    edge_tcp_ms      FLOAT,
    edge_tls_ms      FLOAT,
    
    -- Origin HTTP Details
    origin_status_code INT,
    origin_error       TEXT,
    origin_served_by   TEXT,
    
    -- Edge HTTP Details
    edge_status_code   INT,
    edge_cache_status  TEXT,
    edge_served_by     TEXT,
    
    -- Payload & Meta
    content_length     BIGINT,
    is_manual          BOOLEAN     DEFAULT FALSE,
    probe_version      TEXT,
    
    -- Extras for deep analysis
    server_timing_breakdown JSONB
);

-- Converter para hypertable TimescaleDB
SELECT create_hypertable('audit_results', 'time', if_not_exists => TRUE);

-- Índices para performance no dashboard
CREATE INDEX IF NOT EXISTS idx_audit_results_monitor_time
    ON audit_results (monitor_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_audit_results_monitor_region_time
    ON audit_results (monitor_id, region, time DESC);
