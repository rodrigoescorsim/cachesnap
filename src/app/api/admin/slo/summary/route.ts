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

  await logAdminAccess(admin.id, '/api/admin/slo/summary')

  const windowParam = request.nextUrl.searchParams.get('window') ?? '15m'
  const windowMinutes = WINDOW_MINUTES[windowParam] ?? 15
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)

  const [monitorRows, probeTimingRows, totalProbes, alertDelivery, ingestStats] = await Promise.all([
    // All active monitors (for on-time rate denominator)
    sql<{ monitor_id: string; check_interval_seconds: number }[]>`
      SELECT id AS monitor_id, check_interval_seconds
      FROM monitors
      WHERE is_active = true
    `,

    // Probe schedule delay: only rows where scheduled_at is populated.
    // Outliers >300s are excluded per plan definition.
    sql<{
      on_time_count: number
      total_count: number
      p50_delay_s: number | null
      p95_delay_s: number | null
      outlier_count: number
    }[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE EXTRACT(EPOCH FROM (time - scheduled_at)) <= 15
        )::int                                                       AS on_time_count,
        COUNT(*)::int                                                AS total_count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (time - scheduled_at))
        ) FILTER (
          WHERE EXTRACT(EPOCH FROM (time - scheduled_at)) BETWEEN -60 AND 300
        )                                                            AS p50_delay_s,
        PERCENTILE_CONT(0.95) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (time - scheduled_at))
        ) FILTER (
          WHERE EXTRACT(EPOCH FROM (time - scheduled_at)) BETWEEN -60 AND 300
        )                                                            AS p95_delay_s,
        COUNT(*) FILTER (
          WHERE EXTRACT(EPOCH FROM (time - scheduled_at)) > 300
        )::int                                                       AS outlier_count
      FROM probe_results
      WHERE time > ${since}
        AND scheduled_at IS NOT NULL
    `,

    // Total probe count in window (all probes, with or without scheduled_at)
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM probe_results
      WHERE time > ${since}
    `,

    // Notification delivery: alerts with at least one delivery channel
    sql<{ total: number; delivered: number }[]>`
      SELECT
        COUNT(*)::int                                                          AS total,
        COUNT(*) FILTER (WHERE notified_email OR notified_slack)::int         AS delivered
      FROM alerts
      WHERE created_at > ${since}
    `,

    // Ingest success rate from ops table (populated by Rust ingest route).
    // Falls back gracefully when empty (ops table not yet receiving data).
    sql<{ total: number; success: number; fail: number }[]>`
      SELECT
        COALESCE(SUM(success_count + fail_count), 0)::int  AS total,
        COALESCE(SUM(success_count), 0)::int               AS success,
        COALESCE(SUM(fail_count), 0)::int                  AS fail
      FROM ops_ingest_minute_stats
      WHERE time > ${since}
    `.catch(() => [{ total: 0, success: 0, fail: 0 }]),
  ])

  const totalMonitors = monitorRows.length
  const timing = probeTimingRows[0]

  // ── Probe On-Time Rate ─────────────────────────────────────────────────────
  // Use scheduled_at-based count when available (more precise).
  // Fall back to coverage proxy (monitor has had a recent probe) when scheduled_at
  // data is not yet populated (early deployment phase).
  let probeOnTimeRate: number | null = null
  let onTimeNote: string | null = null

  if (timing && timing.total_count > 0) {
    // Accurate: use the actual delay measured against scheduled_at
    probeOnTimeRate = Math.round((timing.on_time_count / timing.total_count) * 1000) / 10
  } else if (totalMonitors > 0) {
    // Fallback proxy: did each active monitor get a probe within 2× its interval?
    const coverageRows = await sql<{ has_recent: boolean }[]>`
      SELECT
        EXISTS (
          SELECT 1 FROM probe_results pr
          WHERE pr.monitor_id = m.id
            AND pr.time > NOW() - make_interval(secs => m.check_interval_seconds * 2)
        ) AS has_recent
      FROM monitors m
      WHERE m.is_active = true
    `
    const onTime = coverageRows.filter((r) => r.has_recent).length
    probeOnTimeRate = Math.round((onTime / totalMonitors) * 1000) / 10
    onTimeNote = 'Estimated — scheduled_at not yet populated'
  }

  // ── Ingest Success Rate ─────────────────────────────────────────────────
  // Primary: ops_ingest_minute_stats (populated by Rust ingest route post-migration 033).
  // Fallback: derive from probe_results.error when ops table has no data yet.
  const opsIngest = ingestStats[0]
  let ingestSuccessRate: number | null = null
  let ingestNote: string | null = null

  if (opsIngest && opsIngest.total > 0) {
    ingestSuccessRate = Math.round((opsIngest.success / opsIngest.total) * 1000) / 10
  } else {
    // Fallback: use probe_results.error as proxy (misses payload-rejection failures)
    const probeErrorProxy = await sql<{ total: number; errors: number }[]>`
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE error IS NOT NULL AND error != '')::int AS errors
      FROM probe_results
      WHERE time > ${since}
    `
    const pt = probeErrorProxy[0]
    if (pt && pt.total > 0) {
      ingestSuccessRate = Math.round(((pt.total - pt.errors) / pt.total) * 1000) / 10
      ingestNote = 'Estimated from probe errors — payload rejections not counted'
    }
  }
  // ── Notification Delivery Rate ─────────────────────────────────────────────
  const alertTotal = alertDelivery[0]?.total ?? 0
  const alertDelivered = alertDelivery[0]?.delivered ?? 0
  const notifyRate = alertTotal > 0 ? Math.round((alertDelivered / alertTotal) * 1000) / 10 : null

  // ── Schedule Delay P50 ────────────────────────────────────────────────────
  const p50s = timing?.p50_delay_s !== null ? Number(timing?.p50_delay_s) : null
  const p50Rounded = p50s !== null ? Math.round(p50s * 10) / 10 : null

  const slos = [
    {
      name: 'Probe On-Time Rate',
      key: 'probe_on_time_rate',
      value: probeOnTimeRate,
      target: 98,
      unit: '%',
      status:
        probeOnTimeRate === null
          ? 'unknown'
          : probeOnTimeRate >= 98
          ? 'healthy'
          : probeOnTimeRate >= 95
          ? 'warning'
          : 'critical',
      note: onTimeNote,
    },
    {
      name: 'Ingest Success Rate',
      key: 'ingest_success_rate',
      value: ingestSuccessRate,
      target: 99.5,
      unit: '%',
      status:
        ingestSuccessRate === null
          ? 'unknown'
          : ingestSuccessRate >= 99.5
          ? 'healthy'
          : ingestSuccessRate >= 97
          ? 'warning'
          : 'critical',
      note: ingestNote,
    },
    {
      name: 'Notification Delivery',
      key: 'notify_delivery_rate',
      value: notifyRate,
      target: 99,
      unit: '%',
      status:
        notifyRate === null
          ? 'unknown'
          : notifyRate >= 99
          ? 'healthy'
          : notifyRate >= 95
          ? 'warning'
          : 'critical',
      note: alertTotal === 0 ? 'No alerts in window' : null,
    },
    {
      name: 'Schedule Delay P50',
      key: 'probe_schedule_delay_p50',
      value: p50Rounded,
      target: 15,
      unit: 's',
      status:
        p50Rounded === null
          ? 'unknown'
          : p50Rounded <= 15
          ? 'healthy'
          : p50Rounded <= 30
          ? 'warning'
          : 'critical',
      note:
        timing && timing.total_count > 0
          ? timing.outlier_count > 0
            ? `${timing.outlier_count} outlier${timing.outlier_count !== 1 ? 's' : ''} >300s excluded`
            : null
          : 'Requires scheduled_at in probe_results',
    },
  ]

  return NextResponse.json({
    data: {
      window: windowParam,
      window_minutes: windowMinutes,
      slos,
      total_probes: totalProbes[0]?.count ?? 0,
      slo_breach_count: slos.filter((s) => s.status === 'critical').length,
      p95_delay_s: timing?.p95_delay_s !== null ? Math.round(Number(timing?.p95_delay_s) * 10) / 10 : null,
      outlier_count: timing?.outlier_count ?? 0,
    },
  })
}
