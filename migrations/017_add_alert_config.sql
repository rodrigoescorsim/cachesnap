-- CacheSnap -- Migration 017: Per-monitor alert configuration
-- Adds toggles for each alert type. alert_threshold_ms already exists from 001_initial.sql.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_down_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_anomaly_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_anycast_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_zombie_cache_enabled  BOOLEAN NOT NULL DEFAULT FALSE;
