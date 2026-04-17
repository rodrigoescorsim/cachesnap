import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params

  // Verify ownership
  const [monitor] = await sql`
    SELECT id FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const hours = Number(request.nextUrl.searchParams.get('hours') ?? 24)
  const clampedHours = Math.min(Math.max(hours, 1), 168) // 1h–7d

  // Per-region stats for the last N hours
  const stats = await sql`
    SELECT
      region,
      COUNT(*)::int                         AS probe_count,
      ROUND(AVG(ttfb_ms)::numeric, 1)       AS ttfb_avg_ms,
      ROUND(MIN(ttfb_ms)::numeric, 1)       AS ttfb_min_ms,
      ROUND(MAX(ttfb_ms)::numeric, 1)       AS ttfb_max_ms,
      ROUND(AVG(total_ms)::numeric, 1)      AS total_avg_ms,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS error_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE cache_status = 'HIT') / NULLIF(COUNT(*), 0),
        1
      )                                     AS cache_hit_pct,
      MAX(time)                             AS last_probe_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - (${clampedHours} || ' hours')::interval
    GROUP BY region
    ORDER BY region
  `

  // Recent alerts for this monitor
  const alerts = await sql`
    SELECT id, region, alert_type, metric, baseline_ms, actual_ms,
           deviation_factor, diagnosis, action, created_at
    FROM alerts
    WHERE monitor_id = ${id}
    ORDER BY created_at DESC
    LIMIT 10
  `

  return NextResponse.json({ stats, alerts })
}
