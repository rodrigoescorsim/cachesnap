-- Migration 042: Cache Age Alert threshold column + reset zombie_cache default to off
-- Replaces the "Zombie Cache" / "Stale Content" naming with "Cache Age Alert".
-- Adds a per-monitor configurable threshold (hours) that the worker will use instead
-- of the previous hardcoded 86 400 s (24 h) boundary.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_cache_age_threshold_hours INT NOT NULL DEFAULT 72,
  ALTER COLUMN alert_zombie_cache_enabled SET DEFAULT false;
