import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

interface ResultRow {
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
  probed_at: Date
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  // UUID format guard — prevents unnecessary DB queries
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Job not found or expired.' }, { status: 404 })
  }

  const [job] = await sql<{ id: string; status: string; url: string; regions_done: number; regions_total: number }[]>`
    SELECT id, status, url, regions_done, regions_total
    FROM public_check_jobs
    WHERE id = ${jobId}
      AND expires_at > NOW()
  `

  if (!job) {
    return NextResponse.json({ error: 'Job not found or expired.' }, { status: 404 })
  }

  const results = await sql<ResultRow[]>`
    SELECT
      region,
      ttfb_ms,
      total_ms,
      dns_ms,
      tcp_ms,
      tls_ms,
      edge_ms,
      origin_ms,
      download_ms,
      cache_status,
      cdn_provider,
      served_by,
      status_code,
      age_s,
      cache_control,
      security_score,
      error,
      redirect_count,
      server_timing_breakdown,
      probed_at
    FROM public_check_results
    WHERE job_id = ${jobId}
    ORDER BY region
  `

  return NextResponse.json({
    status: job.status,
    url: job.url,
    regionsDone: job.regions_done,
    regionsTotal: job.regions_total,
    results: results.map(r => ({
      region: r.region,
      ttfb_ms: r.ttfb_ms,
      total_ms: r.total_ms,
      dns_ms: r.dns_ms,
      tcp_ms: r.tcp_ms,
      tls_ms: r.tls_ms,
      edge_ms: r.edge_ms,
      origin_ms: r.origin_ms,
      download_ms: r.download_ms,
      cache_status: r.cache_status,
      cdn_provider: r.cdn_provider,
      served_by: r.served_by,
      status_code: r.status_code,
      age_s: r.age_s,
      cache_control: r.cache_control,
      security_score: r.security_score,
      error: r.error,
      redirect_count: r.redirect_count,
      server_timing_breakdown: r.server_timing_breakdown,
      probed_at: r.probed_at instanceof Date ? r.probed_at.toISOString() : r.probed_at,
    })),
  })
}
