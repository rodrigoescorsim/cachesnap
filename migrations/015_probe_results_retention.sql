-- Retain probe_results for a maximum of 91 days (Team plan maximum is 90 days; +1 day buffer).
-- Lower-tier plans (free=7d, pro=30d) are enforced at the query level, not by deletion,
-- so that users who upgrade can immediately access their full historical data.
SELECT add_retention_policy('probe_results', INTERVAL '91 days', if_not_exists => TRUE);
