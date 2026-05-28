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

/** Monitors with at least one enabled channel and a non-empty destination. */
const MONITOR_HAS_DESTINATION = sql`
  (
    (m.notify_email_enabled AND NULLIF(BTRIM(m.notify_email), '') IS NOT NULL)
    OR (m.notify_slack_enabled AND NULLIF(BTRIM(m.notify_slack_webhook), '') IS NOT NULL)
    OR (m.notify_webhook_enabled AND NULLIF(BTRIM(m.notify_webhook_url), '') IS NOT NULL)
  )
`

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/alerts/delivery')

  const windowParam = request.nextUrl.searchParams.get('window') ?? '15m'
  const windowMinutes = WINDOW_MINUTES[windowParam] ?? 15
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)

  const [totals, byType, byChannel, recentErrors, latencyRow] = await Promise.all([
    sql<{ total: number; delivered: number }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.notified_email OR a.notified_slack OR a.notified_webhook)::int AS delivered
      FROM alerts a
      JOIN monitors m ON m.id = a.monitor_id
      WHERE a.created_at > ${since}
        AND ${MONITOR_HAS_DESTINATION}
    `,
    sql<{ alert_type: string; total: number; delivered: number; failed: number }[]>`
      SELECT
        a.alert_type,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.notified_email OR a.notified_slack OR a.notified_webhook)::int AS delivered,
        COUNT(*) FILTER (WHERE NOT a.notified_email AND NOT a.notified_slack AND NOT a.notified_webhook)::int AS failed
      FROM alerts a
      JOIN monitors m ON m.id = a.monitor_id
      WHERE a.created_at > ${since}
        AND ${MONITOR_HAS_DESTINATION}
      GROUP BY a.alert_type
      ORDER BY total DESC
    `,
    sql<{
      channel: string
      provider: string
      delivered: number
      failed: number
    }[]>`
      SELECT
        channel,
        provider,
        COALESCE(SUM(success_count), 0)::int AS delivered,
        COALESCE(SUM(fail_count), 0)::int AS failed
      FROM ops_alert_delivery_stats
      WHERE time > ${since}
      GROUP BY channel, provider
      ORDER BY SUM(fail_count) DESC, channel
    `.catch(() => []),
    sql<{
      channel: string
      provider: string
      error_message: string
      time: Date
    }[]>`
      SELECT channel, provider, error_message, time
      FROM ops_alert_delivery_stats
      WHERE time > ${since}
        AND fail_count > 0
        AND error_message IS NOT NULL
      ORDER BY time DESC
      LIMIT 8
    `.catch(() => []),
    sql<{ mean_latency_ms: number | null }[]>`
      SELECT ROUND(AVG(avg_latency_ms))::int AS mean_latency_ms
      FROM ops_alert_delivery_stats
      WHERE time > ${since}
        AND success_count > 0
        AND avg_latency_ms IS NOT NULL
    `.catch(() => []),
  ])

  const total = totals[0]?.total ?? 0
  const delivered = totals[0]?.delivered ?? 0
  const failed = Math.max(0, total - delivered)
  const deliveryRate = total > 0 ? Math.round((delivered / total) * 1000) / 10 : null

  return NextResponse.json({
    data: {
      window: windowParam,
      total_alerts: total,
      delivered,
      failed_deliveries: failed,
      by_type: byType,
      by_channel: byChannel,
      recent_errors: recentErrors.map(row => ({
        channel: row.channel,
        provider: row.provider,
        message: row.error_message,
        time: row.time.toISOString(),
      })),
      delivery_rate: deliveryRate,
      mean_delivery_latency_ms: latencyRow[0]?.mean_latency_ms ?? null,
    },
  })
}
