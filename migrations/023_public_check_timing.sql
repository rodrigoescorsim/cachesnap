ALTER TABLE public_check_results
  ADD COLUMN dns_ms                  INTEGER,
  ADD COLUMN tcp_ms                  INTEGER,
  ADD COLUMN tls_ms                  INTEGER,
  ADD COLUMN edge_ms                 INTEGER,
  ADD COLUMN origin_ms               INTEGER,
  ADD COLUMN download_ms             INTEGER,
  ADD COLUMN server_timing_breakdown JSONB;
