-- Add probe_version column to probe_results for sync debugging
ALTER TABLE probe_results ADD COLUMN probe_version TEXT;
