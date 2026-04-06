-- HopLens - Migration para adicionar métricas de Borda e Origem
-- Estas métricas são extraídas do header Server-Timing pelos Workers

ALTER TABLE probe_results 
ADD COLUMN IF NOT EXISTS edge_ms   FLOAT,
ADD COLUMN IF NOT EXISTS origin_ms FLOAT;
