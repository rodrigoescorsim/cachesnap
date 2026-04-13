-- CacheSnap — Migration 005: Age header, Security headers audit, Server-Timing full breakdown
-- Adds per-probe metadata that enables:
--   • Zombie cache detection (age_s > 86400 → stale content)
--   • Security headers audit with 0–5 score
--   • Full Server-Timing breakdown (db, auth, cache, etc.) stored as JSONB

ALTER TABLE probe_results
  ADD COLUMN IF NOT EXISTS age_s                   INT,      -- Value of Age response header (seconds)
  ADD COLUMN IF NOT EXISTS security_headers        JSONB,    -- {hsts, csp, x_frame_options, x_content_type, referrer_policy, score}
  ADD COLUMN IF NOT EXISTS server_timing_breakdown JSONB;    -- {metric_name: dur_ms, ...} — all named Server-Timing entries
