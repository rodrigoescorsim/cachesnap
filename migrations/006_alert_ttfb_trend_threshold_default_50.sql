-- TTFB trend: default relative change threshold (% vs reference window).

ALTER TABLE monitors
    ALTER COLUMN alert_ttfb_trend_threshold_pct SET DEFAULT 50.0;
