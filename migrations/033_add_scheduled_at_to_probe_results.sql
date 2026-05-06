-- Migration 033: Add scheduled_at to probe_results for precise SLO measurement
-- This field captures the time the probe was SCHEDULED to run, enabling accurate
-- schedule delay computation (actual_time - scheduled_at) for the P50 SLO metric.
-- Probes without this field (historical rows) will have NULL and are excluded from
-- delay calculations per the plan's exclusion rules.

ALTER TABLE probe_results ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Index to support SLO queries filtering on scheduled_at
CREATE INDEX IF NOT EXISTS idx_probe_results_scheduled_at
  ON probe_results (scheduled_at DESC)
  WHERE scheduled_at IS NOT NULL;
