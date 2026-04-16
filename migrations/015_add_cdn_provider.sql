-- Persisted edge CDN label (probe computes from headers; UI falls back to heuristics on legacy rows).

ALTER TABLE probe_results
  ADD COLUMN IF NOT EXISTS cdn_provider TEXT;
