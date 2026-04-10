-- Add tcp_ms column to probe_results
ALTER TABLE probe_results ADD COLUMN tcp_ms DOUBLE PRECISION;
