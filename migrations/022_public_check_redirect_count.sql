ALTER TABLE public_check_results
  ADD COLUMN IF NOT EXISTS redirect_count SMALLINT;
