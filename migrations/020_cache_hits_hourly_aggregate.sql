-- Migration 020: Cache Hit Continuous Aggregate
-- Fornece agregações horárias pré-calculadas para acelerar alertas e dashboards.

-- 1. Criar a view de agregação
CREATE MATERIALIZED VIEW IF NOT EXISTS cache_hits_hourly
WITH (timescaledb.continuous = true) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    monitor_id,
    region,
    COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING')) AS hit_count,
    COUNT(*) AS total_count
FROM probe_results
WHERE error IS NULL AND status_code < 500
GROUP BY bucket, monitor_id, region
WITH NO DATA;

-- 2. Configurar a política de atualização (refresh a cada 1 hora)
-- Cobrimos as últimas 2 horas para garantir que dados atrasados sejam incluídos.
SELECT add_continuous_aggregate_policy('cache_hits_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '0 minutes',
    schedule_interval => INTERVAL '1 hour');

-- 3. (Opcional) Política de retenção para a view (ex: manter histórico de 30 dias para trends)
SELECT add_retention_policy('cache_hits_hourly', INTERVAL '30 days');
