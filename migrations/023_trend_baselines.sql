CREATE TABLE IF NOT EXISTS trend_baselines (
    monitor_id              UUID        REFERENCES monitors(id) ON DELETE CASCADE,
    region                  TEXT        NOT NULL,
    bucket_hour             TIMESTAMPTZ NOT NULL,
    metric                  TEXT        NOT NULL,
    current_value           FLOAT,
    current_samples         INT,
    prev_hour_value         FLOAT,
    prev_hour_samples       INT,
    same_hour_yday_value    FLOAT,
    same_hour_yday_samples  INT,
    day_avg_value           FLOAT,
    day_avg_samples         INT,
    computed_at             TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (monitor_id, region, bucket_hour, metric)
);

CREATE INDEX IF NOT EXISTS idx_trend_baselines_lookup
    ON trend_baselines (monitor_id, region, metric, bucket_hour DESC);
