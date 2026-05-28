import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function POST(request: NextRequest) {
  const probeSecret = request.headers.get('x-probe-secret')
  if (!probeSecret || probeSecret !== process.env.PROBE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    job_id?: string
    region?: string
    ttfb_ms?: number | null
    total_ms?: number | null
    status_code?: number | null
    cache_status?: string | null
    cdn_provider?: string | null
    served_by?: string | null
    age_s?: number | null
    cache_control?: string | null
    cf_ray?: string | null
    x_cache?: string | null
    security_score?: number | null
    error?: string | null
    probe_version?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { job_id, region } = body
  if (!job_id || !region) {
    return NextResponse.json({ error: 'job_id and region are required.' }, { status: 400 })
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job_id)) {
    return NextResponse.json({ error: 'Invalid job_id format.' }, { status: 400 })
  }

  // Verify job exists and is not expired — single fast lookup
  const [job] = await sql<{ id: string }[]>`
    SELECT id FROM public_check_jobs
    WHERE id = ${job_id} AND expires_at > NOW()
  `
  if (!job) {
    return NextResponse.json({ error: 'Job not found or expired.' }, { status: 404 })
  }

  // Insert result — ON CONFLICT DO NOTHING guards against Lambda retries
  // (backed by UNIQUE INDEX idx_public_results_job_region)
  await sql`
    INSERT INTO public_check_results (
      job_id, region,
      ttfb_ms, total_ms, status_code,
      cache_status, cdn_provider, served_by,
      age_s, cache_control, cf_ray, x_cache,
      security_score, error, probe_version
    ) VALUES (
      ${job_id}, ${region},
      ${body.ttfb_ms ?? null}, ${body.total_ms ?? null}, ${body.status_code ?? null},
      ${body.cache_status ?? null}, ${body.cdn_provider ?? null}, ${body.served_by ?? null},
      ${body.age_s ?? null}, ${body.cache_control ?? null}, ${body.cf_ray ?? null}, ${body.x_cache ?? null},
      ${body.security_score ?? null}, ${body.error ?? null}, ${body.probe_version ?? null}
    )
    ON CONFLICT (job_id, region) DO NOTHING
  `

  // Atomic increment — avoids read-then-write race when multiple Lambdas return simultaneously.
  // Only increments if this region was not already counted (result was just inserted).
  // Returns the updated counters so the caller can determine completion without an extra query.
  const [updated] = await sql<{ regions_done: number; regions_total: number; is_complete: boolean }[]>`
    UPDATE public_check_jobs
    SET
      regions_done = regions_done + 1,
      status = CASE
        WHEN regions_done + 1 >= regions_total THEN 'complete'
        ELSE 'running'
      END
    WHERE id = ${job_id}
      AND regions_done < regions_total
    RETURNING
      regions_done,
      regions_total,
      (regions_done >= regions_total) AS is_complete
  `

  return NextResponse.json({
    ok: true,
    regionsDone: updated?.regions_done ?? null,
    complete: updated?.is_complete ?? false,
  })
}
