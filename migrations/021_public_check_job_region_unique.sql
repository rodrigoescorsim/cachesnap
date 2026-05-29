-- Required for ON CONFLICT (job_id, region) in /api/public/ingest.
-- Some dev DBs were created before idx_public_results_job_region existed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_results_job_region
  ON public_check_results (job_id, region);
