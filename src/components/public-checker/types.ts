export interface CheckResult {
  region: string
  ttfb_ms: number | null
  total_ms: number | null
  cache_status: string | null
  cdn_provider: string | null
  served_by: string | null
  status_code: number | null
  age_s: number | null
  cache_control: string | null
  security_score: number | null
  error: string | null
  redirect_count: number | null
  probed_at: string
}

export interface CheckJobResponse {
  status: 'pending' | 'running' | 'complete' | 'error'
  url: string
  regionsDone: number
  regionsTotal: number
  results: CheckResult[]
}
