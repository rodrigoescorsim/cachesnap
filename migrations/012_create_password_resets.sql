-- ── Password Reset Tokens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token         TEXT UNIQUE NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast token validation
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_lookup ON password_reset_tokens (token);
