-- Trend alerts: require enough hourly probe samples before comparing windows (reduces noise).
-- New monitors inherit this default; existing rows keep their saved value.

ALTER TABLE monitors
    ALTER COLUMN alert_trend_min_samples SET DEFAULT 10;
