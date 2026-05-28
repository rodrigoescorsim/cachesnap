import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

const WINDOW_MINUTES: Record<string, number> = {
  '15m': 15,
  '1h': 60,
  '24h': 1440,
  '7d': 10080,
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/public-checker/stats')

  const windowParam = request.nextUrl.searchParams.get('window') ?? '15m'
  const windowMinutes = WINDOW_MINUTES[windowParam] ?? 15
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)

  const [totals, topUrls, topCdns, sparklineRows, running, rateLimited] = await Promise.all([
    sql<{
      total_checks: number
      completed: number
      errors: number
      unique_ips: number
      avg_ttfb_ms: number | null
    }[]>`
      SELECT
        COUNT(*)::int                                                    AS total_checks,
        COUNT(*) FILTER (WHERE j.status = 'complete')::int              AS completed,
        COUNT(*) FILTER (WHERE j.status = 'error')::int                 AS errors,
        COUNT(DISTINCT j.ip)::int                                       AS unique_ips,
        ROUND(AVG(r.ttfb_ms))::int                                      AS avg_ttfb_ms
      FROM public_check_jobs j
      LEFT JOIN public_check_results r ON r.job_id = j.id
      WHERE j.created_at > ${since}
    `,

    sql<{ url: string; checks: number }[]>`
      SELECT url, COUNT(*)::int AS checks
      FROM public_check_jobs
      WHERE created_at > ${since}
      GROUP BY url
      ORDER BY checks DESC
      LIMIT 10
    `,

    sql<{ cdn_provider: string; total: number }[]>`
      SELECT r.cdn_provider, COUNT(*)::int AS total
      FROM public_check_results r
      JOIN public_check_jobs j ON r.job_id = j.id
      WHERE j.created_at > ${since}
        AND r.cdn_provider IS NOT NULL
      GROUP BY r.cdn_provider
      ORDER BY total DESC
      LIMIT 5
    `,

    sql<{ hour: Date; checks: number }[]>`
      SELECT
        date_trunc('hour', created_at) AS hour,
        COUNT(*)::int                  AS checks
      FROM public_check_jobs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY hour
      ORDER BY hour
    `,

    sql<[{ running: number }]>`
      SELECT COUNT(*)::int AS running
      FROM public_check_jobs
      WHERE status = 'running'
    `,

    sql<[{ count: number }]>`
      SELECT COUNT(*)::int AS count
      FROM rate_limit_attempts
      WHERE key LIKE 'public_check:%'
        AND created_at > ${since}
    `.catch(() => [{ count: 0 }] as [{ count: number }]),
  ])

  const t = totals[0]
  const completionRate =
    t.total_checks > 0
      ? Math.round((t.completed / t.total_checks) * 1000) / 10
      : null

  return NextResponse.json({
    data: {
      window: windowParam,
      total_checks: t.total_checks,
      completed: t.completed,
      errors: t.errors,
      unique_ips: t.unique_ips,
      completion_rate: completionRate,
      avg_ttfb_ms: t.avg_ttfb_ms,
      rate_limited: rateLimited[0]?.count ?? 0,
      running_now: running[0]?.running ?? 0,
      top_urls: topUrls,
      top_cdns: topCdns,
      sparkline_24h: sparklineRows.map(r => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : r.hour,
        checks: r.checks,
      })),
    },
  })
}
