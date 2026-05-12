-- Trend comparators: default to prev_hour + day_avg (same-hour-yesterday off by default).

ALTER TABLE monitors
    ALTER COLUMN alert_cache_hit_trend_comparators SET DEFAULT ARRAY['prev_hour', 'day_avg']::text[];

ALTER TABLE monitors
    ALTER COLUMN alert_ttfb_trend_comparators SET DEFAULT ARRAY['prev_hour', 'day_avg']::text[];

-- Align legacy factory default (all three enabled) to the new default.
UPDATE monitors
SET
    alert_cache_hit_trend_comparators = ARRAY['prev_hour', 'day_avg']::text[],
    alert_ttfb_trend_comparators = ARRAY['prev_hour', 'day_avg']::text[]
WHERE alert_cache_hit_trend_comparators = ARRAY['prev_hour', 'same_hour_prev_day', 'day_avg']::text[]
  AND alert_ttfb_trend_comparators = ARRAY['prev_hour', 'same_hour_prev_day', 'day_avg']::text[];
