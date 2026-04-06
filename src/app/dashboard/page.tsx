import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'

interface MonitorSummary {
  id: string
  url: string
  name: string | null
  is_active: boolean
  ttfb_avg_ms: number | null
  ttfb_worst_ms: number | null
  error_count: number
  cache_hit_pct: number | null
  last_probe_at: Date | null
  alert_count: number
}

async function getMonitorSummaries(userId: string): Promise<MonitorSummary[]> {
  return sql<MonitorSummary[]>`
    WITH alert_counts AS (
      SELECT monitor_id, COUNT(*)::int AS cnt
      FROM alerts
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY monitor_id
    )
    SELECT
      m.id,
      m.url,
      m.name,
      m.is_active,
      ROUND(AVG(pr.ttfb_ms)::numeric, 0)                          AS ttfb_avg_ms,
      ROUND(MAX(pr.ttfb_ms)::numeric, 0)                          AS ttfb_worst_ms,
      COUNT(*) FILTER (WHERE pr.error IS NOT NULL)::int            AS error_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE pr.cache_status = 'HIT')
               / NULLIF(COUNT(pr.time), 0),
        0
      )                                                            AS cache_hit_pct,
      MAX(pr.time)                                                 AS last_probe_at,
      COALESCE(ac.cnt, 0)                                          AS alert_count
    FROM monitors m
    LEFT JOIN probe_results pr ON pr.monitor_id = m.id
    LEFT JOIN alert_counts ac ON ac.monitor_id = m.id
    WHERE m.user_id = ${userId}
    GROUP BY m.id, ac.cnt
    ORDER BY alert_count DESC, m.created_at DESC
  `
}

function statusColor(monitor: MonitorSummary) {
  if (!monitor.is_active) return 'text-zinc-400'
  if (monitor.error_count > 0 || monitor.alert_count > 0) return 'text-red-500'
  if (monitor.ttfb_avg_ms && monitor.ttfb_avg_ms > 800) return 'text-amber-500'
  if (!monitor.last_probe_at) return 'text-zinc-400'
  return 'text-emerald-500'
}

function statusLabel(monitor: MonitorSummary) {
  if (!monitor.is_active) return 'Paused'
  if (monitor.error_count > 0) return 'Errors'
  if (monitor.alert_count > 0) return 'Alert'
  if (monitor.ttfb_avg_ms && monitor.ttfb_avg_ms > 800) return 'Slow'
  if (!monitor.last_probe_at) return 'No data'
  return 'Healthy'
}

function advisorNarrative(monitors: MonitorSummary[]): string | null {
  const active = monitors.filter(m => m.is_active && m.last_probe_at)
  if (active.length === 0) return null

  const withAlerts = active.filter(m => m.alert_count > 0)
  const withErrors = active.filter(m => m.error_count > 0)
  const slow = active.filter(m => m.ttfb_avg_ms && m.ttfb_avg_ms > 800)

  if (withErrors.length > 0) {
    return `${withErrors.length} monitor${withErrors.length > 1 ? 's are' : ' is'} returning errors in the last 24h. Check the details below.`
  }
  if (withAlerts.length > 0) {
    return `${withAlerts.length} monitor${withAlerts.length > 1 ? 's have' : ' has'} active alerts. Performance anomalies detected.`
  }
  if (slow.length > 0) {
    const worst = slow.sort((a, b) => (b.ttfb_avg_ms ?? 0) - (a.ttfb_avg_ms ?? 0))[0]
    return `${worst.name ?? worst.url} is averaging ${worst.ttfb_avg_ms}ms TTFB — above the 800ms threshold.`
  }
  return `All ${active.length} monitor${active.length > 1 ? 's are' : ' is'} healthy. No anomalies in the last 24 hours.`
}

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) return null

  const monitors = await getMonitorSummaries(user.id)
  const narrative = advisorNarrative(monitors)
  const topActions = monitors.filter(m => m.alert_count > 0 || m.error_count > 0).slice(0, 3)

  return (
    <div className="space-y-8">
      {/* Advisor banner */}
      {narrative && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-5 py-4">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{narrative}</p>
          {topActions.length > 0 && (
            <ul className="mt-3 space-y-1">
              {topActions.map(m => (
                <li key={m.id} className="text-sm text-zinc-500 dark:text-zinc-400">
                  <Link href={`/dashboard/monitors/${m.id}`} className="hover:underline text-zinc-700 dark:text-zinc-300">
                    {m.name ?? m.url}
                  </Link>
                  {m.error_count > 0 && ` — ${m.error_count} error${m.error_count > 1 ? 's' : ''}`}
                  {m.alert_count > 0 && ` — ${m.alert_count} alert${m.alert_count > 1 ? 's' : ''}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Monitors
          <span className="ml-2 text-sm font-normal text-zinc-400">({monitors.length})</span>
        </h2>
        <Link
          href="/dashboard/monitors/new"
          className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          Add monitor
        </Link>
      </div>

      {/* Monitor cards */}
      {monitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-16 text-center">
          <p className="text-sm text-zinc-500">No monitors yet.</p>
          <Link
            href="/dashboard/monitors/new"
            className="mt-3 inline-block text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
          >
            Add your first monitor
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {monitors.map(m => (
            <Link
              key={m.id}
              href={`/dashboard/monitors/${m.id}`}
              className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {m.name ?? new URL(m.url).hostname}
                  </p>
                  <p className="truncate text-xs text-zinc-400 mt-0.5">{m.url}</p>
                </div>
                <span className={`shrink-0 text-xs font-medium ${statusColor(m)}`}>
                  {statusLabel(m)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {m.ttfb_avg_ms != null ? `${m.ttfb_avg_ms}` : '—'}
                  </p>
                  <p className="text-xs text-zinc-400">TTFB avg ms</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {m.cache_hit_pct != null ? `${m.cache_hit_pct}%` : '—'}
                  </p>
                  <p className="text-xs text-zinc-400">Cache hit</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold tabular-nums ${m.alert_count > 0 ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-50'}`}>
                    {m.alert_count}
                  </p>
                  <p className="text-xs text-zinc-400">Alerts 24h</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
