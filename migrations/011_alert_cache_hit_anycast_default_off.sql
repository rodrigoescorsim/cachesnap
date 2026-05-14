-- Low cache hit + anycast alerts off by default (new monitors + existing rows).
ALTER TABLE monitors ALTER COLUMN alert_anycast_enabled SET DEFAULT FALSE;
ALTER TABLE monitors ALTER COLUMN alert_cache_hit_enabled SET DEFAULT FALSE;

UPDATE monitors
SET
  alert_anycast_enabled = FALSE,
  alert_cache_hit_enabled = FALSE;
