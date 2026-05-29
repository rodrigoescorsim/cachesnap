import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

/** Lambda sends sub-ms floats; public_check_results stores INTEGER ms columns. */
function toIntMs(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

export async function POST(request: NextRequest) {
  const probeSecret = request.headers.get('x-probe-secret')
  if (!probeSecret || probeSecret !== process.env.PROBE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    job_id?: string
    /** Legacy alias sent by Lambda when dispatch uses monitor_id field name */
    monitor_id?: string
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

  const jobId = body.job_id ?? body.monitor_id
  const { region } = body
  if (!jobId || !region) {
    return NextResponse.json({ error: 'job_id and region are required.' }, { status: 400 })
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job_id format.' }, { status: 400 })
  }

  const [job] = await sql<{ id: string }[]>`
    SELECT id FROM public_check_jobs
    WHERE id = ${jobId} AND expires_at > NOW()
  `
  if (!job) {
    return NextResponse.json({ error: 'Job not found or expired.' }, { status: 404 })
  }

  const ttfbMs = toIntMs(body.ttfb_ms)
  const totalMs = toIntMs(body.total_ms)
  const statusCode =
    body.status_code === null || body.status_code === undefined
      ? null
      : toIntMs(body.status_code)
  const ageS = toIntMs(body.age_s)
  const securityScore = toIntMs(body.security_score)

  // Single atomic statement: INSERT the result, then increment regions_done
  // ONLY if the INSERT actually created a new row (i.e., not a Lambda retry).
  // The CTE `ins` exposes whether the INSERT succeeded via EXISTS — this is the
  // guard that prevents retried deliveries from double-counting regions_done.
  const [updated] = await sql<{ regions_done: number; regions_total: number; is_complete: boolean }[]>`
    WITH ins AS (
      INSERT INTO public_check_results (
        job_id, region,
        ttfb_ms, total_ms, status_code,
        cache_status, cdn_provider, served_by,
        age_s, cache_control, cf_ray, x_cache,
        security_score, error, probe_version
      ) VALUES (
        ${jobId}, ${region},
        ${ttfbMs}, ${totalMs}, ${statusCode},
        ${body.cache_status ?? null}, ${body.cdn_provider ?? null}, ${body.served_by ?? null},
        ${ageS}, ${body.cache_control ?? null}, ${body.cf_ray ?? null}, ${body.x_cache ?? null},
        ${securityScore}, ${body.error ?? null}, ${body.probe_version ?? null}
      )
      ON CONFLICT (job_id, region) DO NOTHING
      RETURNING id
    )
    UPDATE public_check_jobs
    SET
      regions_done = regions_done + 1,
      status = CASE
        WHEN regions_done + 1 >= regions_total THEN 'complete'
        ELSE 'running'
      END
    WHERE id = ${jobId}
      AND regions_done < regions_total
      AND EXISTS (SELECT 1 FROM ins)
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
