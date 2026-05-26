-- ── Rate Limit Attempts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_attempts (
    id         BIGSERIAL PRIMARY KEY,
    key        TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time
    ON rate_limit_attempts (key, created_at DESC);
