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

  await logAdminAccess(admin.id, '/api/admin/alerts/delivery')

  const windowParam = request.nextUrl.searchParams.get('window') ?? '15m'
  const windowMinutes = WINDOW_MINUTES[windowParam] ?? 15
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)

  const [totals, byType] = await Promise.all([
    sql<{ total: number; delivered: number }[]>`
      SELECT
        COUNT(*)::int                                                              AS total,
        COUNT(*) FILTER (WHERE notified_email OR notified_slack)::int             AS delivered
      FROM alerts
      WHERE created_at > ${since}
    `,
    sql<{ alert_type: string; total: number; delivered: number; failed: number }[]>`
      SELECT
        alert_type,
        COUNT(*)::int                                                              AS total,
        COUNT(*) FILTER (WHERE notified_email OR notified_slack)::int             AS delivered,
        COUNT(*) FILTER (WHERE NOT notified_email AND NOT notified_slack)::int    AS failed
      FROM alerts
      WHERE created_at > ${since}
      GROUP BY alert_type
      ORDER BY total DESC
    `,
  ])

  const total = totals[0]?.total ?? 0
  const delivered = totals[0]?.delivered ?? 0
  const deliveryRate = total > 0 ? Math.round((delivered / total) * 1000) / 10 : null

  return NextResponse.json({
    data: {
      window: windowParam,
      total_alerts: total,
      by_type: byType,
      delivery_rate: deliveryRate,
      mean_delivery_latency_ms: null,
    },
  })
}
