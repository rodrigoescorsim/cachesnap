-- Fase 1: Motor de Readiness
-- Adiciona colunas de estado de readiness em monitors e cria log de transições

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS audit_readiness_state           TEXT    NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS audit_readiness_updated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_readiness_consecutive_hits INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_readiness_reason          TEXT,
  ADD COLUMN IF NOT EXISTS audit_readiness_comparable_pairs     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_readiness_comparable_regions   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_readiness_edge_hit_ratio  FLOAT  NOT NULL DEFAULT 0;

-- Melhoria #5: Log de transições de estado (suporte/observabilidade)
CREATE TABLE IF NOT EXISTS audit_state_transitions (
    id          BIGSERIAL    PRIMARY KEY,
    monitor_id  UUID         NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    from_state  TEXT         NOT NULL,
    to_state    TEXT         NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ast_monitor_time
    ON audit_state_transitions (monitor_id, created_at DESC);
