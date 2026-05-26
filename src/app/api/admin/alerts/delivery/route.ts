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

  const [totals, byType, providerTotals] = await Promise.all([
    sql<{ total: number; delivered: number }[]>`
      SELECT
        COUNT(*)::int                                                              AS total,
        COUNT(*) FILTER (WHERE notified_email OR notified_slack OR notified_webhook)::int AS delivered
      FROM alerts
      WHERE created_at > ${since}
    `,
    sql<{ alert_type: string; total: number; delivered: number; failed: number }[]>`
      SELECT
        alert_type,
        COUNT(*)::int                                                              AS total,
        COUNT(*) FILTER (WHERE notified_email OR notified_slack OR notified_webhook)::int AS delivered,
        COUNT(*) FILTER (WHERE NOT notified_email AND NOT notified_slack AND NOT notified_webhook)::int AS failed
      FROM alerts
      WHERE created_at > ${since}
      GROUP BY alert_type
      ORDER BY total DESC
    `,
    sql<{
      total: number
      delivered: number
      failed: number
      mean_latency_ms: number | null
    }[]>`
      SELECT
        COALESCE(SUM(success_count + fail_count), 0)::int AS total,
        COALESCE(SUM(success_count), 0)::int AS delivered,
        COALESCE(SUM(fail_count), 0)::int AS failed,
        ROUND(AVG(avg_latency_ms))::int AS mean_latency_ms
      FROM ops_alert_delivery_stats
      WHERE time > ${since}
    `.catch(() => []),
  ])

  const providerTotal = providerTotals[0]?.total ?? 0
  const total = providerTotal || totals[0]?.total || 0
  const delivered = providerTotal ? providerTotals[0]?.delivered ?? 0 : totals[0]?.delivered ?? 0
  const deliveryRate = total > 0 ? Math.round((delivered / total) * 1000) / 10 : null

  return NextResponse.json({
    data: {
      window: windowParam,
      total_alerts: total,
      by_type: byType,
      delivery_rate: deliveryRate,
      failed_deliveries: providerTotals[0]?.failed ?? null,
      mean_delivery_latency_ms: providerTotals[0]?.mean_latency_ms ?? null,
    },
  })
}
