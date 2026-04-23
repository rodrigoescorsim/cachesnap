ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS alert_cache_hit_trend_enabled         BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_cache_hit_trend_threshold_pct   FLOAT    NOT NULL DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS alert_cache_hit_trend_comparators     TEXT[]   NOT NULL DEFAULT ARRAY['prev_hour'],
  ADD COLUMN IF NOT EXISTS alert_ttfb_trend_enabled              BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_ttfb_trend_threshold_pct        FLOAT    NOT NULL DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS alert_ttfb_trend_comparators          TEXT[]   NOT NULL DEFAULT ARRAY['prev_hour'],
  ADD COLUMN IF NOT EXISTS alert_ttfb_trend_direction            TEXT     NOT NULL DEFAULT 'worsening',
  ADD COLUMN IF NOT EXISTS alert_trend_min_samples               INT      NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS alert_trend_cooldown_minutes          INT      NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS alert_trend_require_consecutive       BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_trend_global_enabled            BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_trend_global_threshold_factor   FLOAT    NOT NULL DEFAULT 1.5;
