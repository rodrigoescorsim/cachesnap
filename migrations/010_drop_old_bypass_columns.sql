-- CacheSnap -- Migration 010: Removendo colunas antigas de bypass
-- Remove the bypass_ columns from probe_results to complete the separation
-- of natural metrics from diagnostic audits.

ALTER TABLE probe_results
  DROP COLUMN IF EXISTS bypass_ttfb_ms,
  DROP COLUMN IF EXISTS bypass_total_ms,
  DROP COLUMN IF EXISTS bypass_status_code,
  DROP COLUMN IF EXISTS bypass_error,
  DROP COLUMN IF EXISTS bypass_served_by,
  DROP COLUMN IF EXISTS bypass_server_timing,
  DROP COLUMN IF EXISTS bypass_server_timing_breakdown,
  DROP COLUMN IF EXISTS bypass_age_s;
