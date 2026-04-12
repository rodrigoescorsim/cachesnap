-- HopLens -- Migration 011: Per-monitor audit intervals
-- Adds the ability to customize the frequency of audit (bypass) probes natively.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS audit_interval_seconds INT DEFAULT 3600;
