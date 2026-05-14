-- Product-wide fixed cadence: 5 min checks, 30 min bypass audit (see Settings UI).
UPDATE monitors
SET
  check_interval_seconds = 300,
  audit_interval_seconds = 1800;
