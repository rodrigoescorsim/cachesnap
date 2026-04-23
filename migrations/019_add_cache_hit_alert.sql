-- CacheSnap -- Migration 019: Cache hit rate alert configuration
-- Fires when the 24h rolling average cache hit rate falls below the configured threshold.

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_cache_hit_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_cache_hit_threshold_pct  FLOAT   NOT NULL DEFAULT 80.0;
