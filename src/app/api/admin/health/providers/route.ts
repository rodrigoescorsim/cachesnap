import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

type ProviderStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

interface ProviderEntry {
  name: string
  status: ProviderStatus
  detail: string
  error_count_15m: number | null
  last_success_age_s: number | null
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/health/providers')

  const since15m = new Date(Date.now() - 15 * 60 * 1000)

  const [regions, regionErrors, resendRows, otherChannels] = await Promise.all([
    sql<{ id: string }[]>`
      SELECT id FROM regions WHERE enabled = true ORDER BY id
    `,
    sql<{ region: string; error_count: number; total: number }[]>`
      SELECT
        region,
        COUNT(*) FILTER (WHERE error IS NOT NULL AND error != '')::int AS error_count,
        COUNT(*)::int AS total
      FROM probe_results
      WHERE time > ${since15m}
      GROUP BY region
    `,
    sql<{
      success_count: number
      fail_count: number
      last_success_age_s: number | null
      latest_error: string | null
    }[]>`
      SELECT
        COALESCE(SUM(success_count), 0)::int AS success_count,
        COALESCE(SUM(fail_count), 0)::int AS fail_count,
        EXTRACT(EPOCH FROM (NOW() - MAX(time) FILTER (WHERE success_count > 0)))::int AS last_success_age_s,
        (
          SELECT error_message
          FROM ops_alert_delivery_stats latest
          WHERE latest.channel = 'email'
            AND latest.provider = 'resend'
            AND latest.fail_count > 0
            AND latest.time > ${since15m}
          ORDER BY latest.time DESC
          LIMIT 1
        ) AS latest_error
      FROM ops_alert_delivery_stats
      WHERE channel = 'email'
        AND provider = 'resend'
        AND time > ${since15m}
    `.catch(() => []),
    sql<{
      channel: string
      provider: string
      success_count: number
      fail_count: number
    }[]>`
      SELECT
        channel,
        provider,
        COALESCE(SUM(success_count), 0)::int AS success_count,
        COALESCE(SUM(fail_count), 0)::int AS fail_count
      FROM ops_alert_delivery_stats
      WHERE time > ${since15m}
        AND NOT (channel = 'email' AND provider = 'resend')
      GROUP BY channel, provider
    `.catch(() => []),
  ])

  const regionIds = regions.map(r => r.id)
  const regionMap = new Map(regionErrors.map(r => [r.region, r]))
  const resend = resendRows[0]
  const resendSuccess = Number(resend?.success_count ?? 0)
  const resendFailures = Number(resend?.fail_count ?? 0)
  const resendTotal = resendSuccess + resendFailures
  const latestResendError = resend?.latest_error ? resend.latest_error.slice(0, 160) : null
  const resendStatus: ProviderStatus = resendTotal === 0
    ? 'unknown'
    : resendFailures === 0
      ? 'healthy'
      : resendSuccess === 0
        ? 'critical'
        : 'warning'
  const resendDetail = resendTotal === 0
    ? 'No email attempts in last 15 min'
    : resendFailures > 0
      ? `${resendFailures} failed / ${resendSuccess} delivered in 15 min${latestResendError ? `: ${latestResendError}` : ''}`
      : `${resendSuccess} delivered in 15 min`

  const providers: ProviderEntry[] = [
    {
      name: 'Resend',
      status: resendStatus,
      detail: resendDetail,
      error_count_15m: resendFailures,
      last_success_age_s: resend?.last_success_age_s ?? null,
    },
  ]

  for (const row of otherChannels) {
    const success = Number(row.success_count)
    const failures = Number(row.fail_count)
    const total = success + failures
    if (total === 0) continue

    const label =
      row.channel === 'slack'
        ? 'Slack'
        : row.channel === 'webhook'
          ? 'Custom Webhook'
          : `${row.channel} (${row.provider})`
    const status: ProviderStatus =
      failures === 0 ? 'healthy' : success === 0 ? 'critical' : 'warning'
    const detail =
      failures > 0
        ? `${failures} failed / ${success} delivered in 15 min`
        : `${success} delivered in 15 min`

    providers.push({
      name: label,
      status,
      detail,
      error_count_15m: failures,
      last_success_age_s: null,
    })
  }

  for (const regionId of regionIds) {
    const info = regionMap.get(regionId)

    if (!info) {
      providers.push({
        name: `Lambda ${regionId}`,
        status: 'unknown',
        detail: 'No probes in last 15 min',
        error_count_15m: null,
        last_success_age_s: null,
      })
      continue
    }

    const errorCount = Number(info.error_count)
    const total = Number(info.total)
    const errorRate = total > 0 ? errorCount / total : 0

    providers.push({
      name: `Lambda ${regionId}`,
      status: errorRate === 0 ? 'healthy' : errorRate < 0.1 ? 'warning' : 'critical',
      detail: `${errorCount} errors / ${total} probes`,
      error_count_15m: errorCount,
      last_success_age_s: null,
    })
  }

  const hasCritical = providers.some(p => p.status === 'critical')

  return NextResponse.json({
    regions: regionIds,
    data: { providers, has_critical: hasCritical },
  })
}
