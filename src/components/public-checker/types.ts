export interface CheckResult {
  region: string
  ttfb_ms: number | null
  total_ms: number | null
  dns_ms: number | null
  tcp_ms: number | null
  tls_ms: number | null
  edge_ms: number | null
  origin_ms: number | null
  download_ms: number | null
  cache_status: string | null
  cdn_provider: string | null
  served_by: string | null
  status_code: number | null
  age_s: number | null
  cache_control: string | null
  security_score: number | null
  error: string | null
  redirect_count: number | null
  server_timing_breakdown: Record<string, number> | null
  probed_at: string
}

export interface CheckJobResponse {
  status: 'pending' | 'running' | 'complete' | 'error'
  url: string
  regionsDone: number
  regionsTotal: number
  results: CheckResult[]
}
