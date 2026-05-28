CREATE TABLE public_check_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url             TEXT NOT NULL,
  ip              TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | running | complete | error
  regions_total   SMALLINT NOT NULL DEFAULT 8,
  regions_done    SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_public_jobs_ip_created ON public_check_jobs (ip, created_at DESC);
CREATE INDEX idx_public_jobs_expires    ON public_check_jobs (expires_at);
CREATE INDEX idx_public_jobs_status     ON public_check_jobs (status) WHERE status IN ('pending', 'running');

CREATE TABLE public_check_results (
  id              BIGSERIAL PRIMARY KEY,
  job_id          UUID NOT NULL REFERENCES public_check_jobs(id) ON DELETE CASCADE,
  region          TEXT NOT NULL,
  ttfb_ms         INTEGER,
  total_ms        INTEGER,
  status_code     SMALLINT,
  cache_status    TEXT,       -- HIT | MISS | BYPASS | EXPIRED | STALE | UNKNOWN
  cdn_provider    TEXT,
  served_by       TEXT,
  age_s           INTEGER,
  cache_control   TEXT,
  cf_ray          TEXT,
  x_cache         TEXT,
  security_score  SMALLINT,   -- 0-100 (HSTS, security headers)
  error           TEXT,
  probe_version   TEXT,
  probed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_public_results_job_region ON public_check_results (job_id, region);
CREATE INDEX idx_public_results_job        ON public_check_results (job_id);
