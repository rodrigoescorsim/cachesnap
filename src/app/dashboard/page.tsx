import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import {
  advisorNarrative,
  cacheSummary,
  problemsSummary,
  speedSummary,
  type MonitorSummary,
} from './presenter'

async function getMonitorSummaries(userId: string): Promise<MonitorSummary[]> {
  return sql<MonitorSummary[]>`
    WITH alert_counts AS (
      SELECT monitor_id, COUNT(*)::int AS cnt
      FROM alerts
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY monitor_id
    ),
    latest_security AS (
      SELECT DISTINCT ON (monitor_id)
        monitor_id,
        (security_headers->>'score')::int AS security_score
      FROM probe_results
      WHERE time > NOW() - INTERVAL '24 hours'
        AND security_headers IS NOT NULL
      ORDER BY monitor_id, time DESC
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
      MODE() WITHIN GROUP (ORDER BY pr.cache_status)               AS cache_status,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE pr.error IS NULL AND pr.status_code < 500)
               / NULLIF(COUNT(pr.time), 0),
        1
      )                                                            AS uptime_pct,
      ROUND(AVG(pr.redirect_count)::numeric, 0)                    AS redirect_avg,
      MAX(pr.time)                                                 AS last_probe_at,
      COALESCE(ac.cnt, 0)                                          AS alert_count,
      ls.security_score                                            AS security_score
    FROM monitors m
    LEFT JOIN probe_results pr ON pr.monitor_id = m.id
    LEFT JOIN alert_counts ac ON ac.monitor_id = m.id
    LEFT JOIN latest_security ls ON ls.monitor_id = m.id
    WHERE m.user_id = ${userId}
    GROUP BY m.id, ac.cnt, ls.security_score
    ORDER BY alert_count DESC, m.created_at DESC
  `
}

function formatProbeAge(lastProbeAt: Date | null): string {
  if (!lastProbeAt) return 'Collecting data'

  const elapsedMs = Date.now() - new Date(lastProbeAt).getTime()
  if (elapsedMs < 60_000) return 'Updated: just now'
  if (elapsedMs < 3_600_000) return `Updated: ${Math.round(elapsedMs / 60_000)}m ago`
  if (elapsedMs < 86_400_000) return `Updated: ${Math.round(elapsedMs / 3_600_000)}h ago`
  return `Updated: ${Math.round(elapsedMs / 86_400_000)}d ago`
}

function probeFreshnessTone(lastProbeAt: Date | null): string {
  if (!lastProbeAt) return 'text-amber-500 dark:text-amber-400'

  const elapsedMs = Date.now() - new Date(lastProbeAt).getTime()
  if (elapsedMs > 6 * 60 * 60_000) return 'text-amber-500 dark:text-amber-400'
  return 'text-zinc-400 dark:text-zinc-500'
}

function uptimeTone(uptimePct: number | null): string {
  if (uptimePct == null) return 'text-zinc-500 dark:text-zinc-400'
  if (uptimePct >= 100) return 'text-zinc-500 dark:text-zinc-400'
  if (uptimePct >= 99.9) return 'text-emerald-500'
  if (uptimePct >= 99) return 'text-green-500'
  if (uptimePct >= 95) return 'text-amber-500'
  return 'text-red-500'
}

function redirectTone(redirectAvg: number | null): string {
  if (redirectAvg == null) return 'text-zinc-500 dark:text-zinc-400'
  if (redirectAvg === 0) return 'text-emerald-600 dark:text-emerald-400'
  if (redirectAvg === 1) return 'text-amber-500'
  if (redirectAvg === 2) return 'text-amber-500'
  return 'text-red-500'
}

function securityTone(securityScore: number | null): string {
  if (securityScore == null) return 'text-zinc-500 dark:text-zinc-400'
  if (securityScore >= 4) return 'text-emerald-500'
  if (securityScore >= 2) return 'text-amber-500'
  return 'text-red-500'
}

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) return null

  const monitors = await getMonitorSummaries(user.id)
  const narrative = advisorNarrative(monitors)
  const topActions = monitors.filter(m => m.alert_count > 0 || m.error_count > 0).slice(0, 3)
  const hasAllData = monitors.every(m => m.last_probe_at)

  return (
    <div className="space-y-8">
      <AutoRefresh hasData={hasAllData} />

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
                  {(m.error_count + m.alert_count) > 0 && ` — ${m.error_count + m.alert_count} issue${m.error_count + m.alert_count > 1 ? 's' : ''}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Header row */}
      <section className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/40 backdrop-blur px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Active monitors
              </h2>
              <span className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {monitors.length} total
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {monitors.length} site{monitors.length === 1 ? '' : 's'} being checked every 5 minutes
            </p>
          </div>
          <Link
            href="/dashboard/monitors/new"
            className="inline-flex items-center justify-center rounded-full bg-zinc-950 dark:bg-zinc-50 px-4 py-2 text-sm font-semibold text-white dark:text-zinc-950 shadow-sm transition-all duration-200 hover:bg-zinc-800 dark:hover:bg-zinc-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 dark:focus-visible:ring-zinc-50/20"
          >
            + Create monitor
          </Link>
        </div>
      </section>

      {/* Monitor cards */}
      {monitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-16 text-center">
          <p className="text-sm text-zinc-500">You are not monitoring any sites yet.</p>
          <Link
            href="/dashboard/monitors/new"
            className="mt-3 inline-block text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
          >
            Add your first site
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {monitors.map(m => {
            const speed = speedSummary(m)
            const cache = cacheSummary(m)
            const problems = problemsSummary(m)
            const totalProblems = m.error_count + m.alert_count
            const lastProbeText = formatProbeAge(m.last_probe_at)
            const lastProbeTone = probeFreshnessTone(m.last_probe_at)
            const isCollecting = m.last_probe_at == null
            const uptimePct = m.uptime_pct
            const redirectAvg = m.redirect_avg
            const redirectCount = redirectAvg == null ? null : Math.round(Number(redirectAvg))
            const securityScore = m.security_score

            return (
              <Link
                key={m.id}
                href={`/dashboard/monitors/${m.id}`}
                className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 cursor-pointer transition-all duration-200 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-50/20"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
                    {m.name ?? new URL(m.url).hostname}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{m.url}</p>
                  <p className={`text-[11px] tabular-nums ${lastProbeTone}`}>
                    {lastProbeText}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Speed
                    </span>
                    <span className={`mt-0.5 block text-[13px] font-semibold tabular-nums ${speed.toneClass}`}>
                      {speed.detail === '—' ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : speed.detail}
                    </span>
                  </div>

                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Cache hit rate
                    </span>
                    <span className={`mt-0.5 block text-[13px] font-semibold tabular-nums ${cache.toneClass}`}>
                      {cache.detail === '—' ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : cache.detail}
                      {cache.helper === 'Dynamic' && (
                        <span className="ml-2 text-[10px] font-normal tracking-wide text-zinc-400 dark:text-zinc-500">
                          {cache.helper}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Uptime
                    </span>
                    <span className={`mt-0.5 block text-[13px] font-semibold tabular-nums ${uptimeTone(uptimePct)}`}>
                      {uptimePct != null ? `${uptimePct}%` : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                    </span>
                  </div>

                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Redirect hops
                    </span>
                    <span className={`mt-0.5 block text-[13px] font-semibold tabular-nums ${redirectTone(redirectCount)}`}>
                      {redirectCount != null
                        ? `${redirectCount}`
                        : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                    </span>
                  </div>

                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Issues
                    </span>
                    <span className={`mt-0.5 block text-[13px] font-semibold tabular-nums ${problems.toneClass}`}>
                      {isCollecting ? <span className="text-zinc-300 dark:text-zinc-600">—</span> : `${totalProblems}`}
                      {!isCollecting && (
                        <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                          {totalProblems === 1 ? 'incident' : 'incidents'}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Security
                    </span>
                    <span className={`mt-0.5 block text-[13px] font-semibold tabular-nums ${securityTone(securityScore)}`}>
                      {securityScore != null ? `${securityScore}/5` : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
