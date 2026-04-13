-- CacheSnap -- Migration 006: Native bypass metrics per probe result
-- Stores bypass request measurements in the same probe_results row
-- so every monitor has normal + bypass comparison by default.

ALTER TABLE probe_results
  ADD COLUMN IF NOT EXISTS bypass_ttfb_ms      FLOAT,
  ADD COLUMN IF NOT EXISTS bypass_total_ms     FLOAT,
  ADD COLUMN IF NOT EXISTS bypass_status_code  INT,
  ADD COLUMN IF NOT EXISTS bypass_error        TEXT;

