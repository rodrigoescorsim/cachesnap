-- HopLens -- Migration 012: Add cache status to origin audit
-- Permite identificar se o bypass realmente funcionou ou se foi servido por cache.

ALTER TABLE audit_results 
ADD COLUMN IF NOT EXISTS origin_cache_status TEXT,
ADD COLUMN IF NOT EXISTS origin_age_s        INT;
