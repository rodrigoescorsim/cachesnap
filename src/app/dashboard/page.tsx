import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { RealTimeHub } from './real-time-hub'
import { AutoRefresh } from './auto-refresh'
import {
  cacheSummary,
  problemsSummary,
  speedSummary,
  type MonitorSummary,
} from './presenter'
import { MonitorCardActions } from './monitor-card-actions'
import { VisualGlow } from './visual-glow'

async function getMonitorSummaries(userId: string) {
  return await sql<MonitorSummary[]>`
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
      m.created_at,
      COALESCE(ac.cnt, 0)                                          AS alert_count,
      ls.security_score,
      stats.ttfb_avg_ms,
      stats.cache_hit_pct,
      stats.uptime_pct,
      stats.last_probe_at,
      stats.error_count
    FROM monitors m
    LEFT JOIN alert_counts ac ON ac.monitor_id = m.id
    LEFT JOIN latest_security ls ON ls.monitor_id = m.id
    LEFT JOIN LATERAL (
      SELECT
        ROUND(AVG(pr.ttfb_ms)::numeric, 0)::int                      AS ttfb_avg_ms,
        ROUND(
          100.0 * COUNT(pr.time) FILTER (WHERE pr.cache_status ILIKE '%HIT%')
                 / NULLIF(COUNT(pr.time), 0),
          1
        )                                                            AS cache_hit_pct,
        ROUND(
          100.0 * COUNT(pr.time) FILTER (WHERE pr.error IS NULL AND pr.status_code < 500)
                 / NULLIF(COUNT(pr.time), 0),
          1
        )                                                            AS uptime_pct,
        MAX(pr.time)                                                 AS last_probe_at,
        COUNT(pr.time) FILTER (WHERE pr.error IS NOT NULL)::int      AS error_count
      FROM probe_results pr
      WHERE pr.monitor_id = m.id
        AND pr.time > NOW() - INTERVAL '24 hours'
    ) stats ON TRUE
    WHERE m.user_id = ${userId}
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
  if (uptimePct == null) return 'text-zinc-500'
  if (uptimePct >= 100) return 'text-zinc-500'
  if (uptimePct >= 99.9) return 'text-[#22C55E]'
  if (uptimePct >= 99) return 'text-[#22C55E]'
  if (uptimePct >= 95) return 'text-[#F59E0B]'
  return 'text-[#EF4444]'
}

function redirectTone(redirectAvg: number | null): string {
  if (redirectAvg == null) return 'text-zinc-500'
  if (redirectAvg === 0) return 'text-[#22C55E]'
  if (redirectAvg === 1) return 'text-[#F59E0B]'
  if (redirectAvg === 2) return 'text-[#F59E0B]'
  return 'text-[#EF4444]'
}

function securityTone(securityScore: number | null): string {
  if (securityScore == null) return 'text-zinc-500'
  if (securityScore >= 4) return 'text-emerald-500'
  if (securityScore >= 2) return 'text-amber-500'
  return 'text-red-500'
}

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) return null

  const monitors = await getMonitorSummaries(user.id)
  console.log(`[DASHBOARD DEBUG] User ${user.id} fetching monitors. Found ${monitors.length}.`)
  monitors.forEach(m => {
    console.log(`[DASHBOARD DEBUG] Monitor: ${m.id} | URL: ${m.url} | Active: ${m.is_active}`)
  })

  return (
    <div className="space-y-8">
      <RealTimeHub userId={user.id} />
      <AutoRefresh intervalMs={300_000} /> {/* Fallback lento a cada 5m */}

      {/* Monitor list header */}
      <section className="cs-card cs-card-glass px-8 py-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Active monitors
              </h2>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
              </div>
              <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                {monitors.length} total
              </span>
            </div>
          </div>
          <Link
            href="/monitors/new"
            className="cs-btn-primary"
          >
            <div className="cs-card-wash opacity-20" />
            <span className="relative z-10">+ Create monitor</span>
          </Link>
        </div>
      </section>

      {/* Monitor cards */}
      {monitors.length === 0 ? (
        <div id="monitors" className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-zinc-500 font-medium">You are not monitoring any sites yet.</p>
          <Link
            href="/monitors/new"
            className="mt-3 inline-block text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
          >
            Add your first site
          </Link>
        </div>
      ) : (
        <div id="monitors" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {monitors.map(m => {
            const speed = speedSummary(m)
            const cache = cacheSummary(m)
            const problems = problemsSummary(m)
            const totalProblems = m.error_count + m.alert_count
            const lastProbeText = formatProbeAge(m.last_probe_at)
            const lastProbeTone = probeFreshnessTone(m.last_probe_at)
            const uptimePct = m.uptime_pct
            const redirectAvg = m.redirect_avg
            const redirectCount = redirectAvg == null ? null : Math.round(Number(redirectAvg))
            const securityScore = m.security_score

            return (
              <div
                key={m.id}
                className="cs-card group relative p-4 transition-all duration-300 hover:border-zinc-700 hover:shadow-xl hover:bg-surface/80"
              >
                <div className="cs-card-wash" />
                <Link
                  href={`/dashboard/monitors/${m.id}`}
                  aria-label={`Open monitor ${m.name ?? new URL(m.url).hostname}`}
                  className="absolute inset-0 z-10 rounded-xl"
                />

                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
                        {m.name ?? new URL(m.url).hostname}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 min-w-0">
                      <span className="truncate">{m.url}</span>
                      <span className="text-zinc-300 dark:text-zinc-700 shrink-0">•</span>
                      <VisualGlow value={m.last_probe_at} className={`shrink-0 tabular-nums ${lastProbeTone}`}>
                        {lastProbeText.replace('Updated: ', '')}
                      </VisualGlow>
                    </div>
                  </div>

                  <MonitorCardActions monitorId={m.id} monitorLabel={m.name ?? new URL(m.url).hostname} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="px-1 py-1">
                    <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500/80">
                      SPEED
                    </span>
                    {speed.detail === '—' ? (
                      <span className="mt-1 block text-[15px] font-semibold tabular-nums">
                        <span className="inline-block w-8 h-4 animate-pulse rounded bg-zinc-800" />
                      </span>
                    ) : (
                      <VisualGlow value={speed.detail} className={`mt-2 block text-[15px] font-bold tabular-nums ${speed.toneClass}`}>
                        {speed.detail}
                      </VisualGlow>
                    )}
                  </div>

                  <div className="px-1 py-1">
                    <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500/80">
                      CACHE HIT
                    </span>
                    {cache.detail === '—' ? (
                      <span className="mt-1 block text-[15px] font-semibold tabular-nums">
                        <span className="inline-block w-12 h-4 animate-pulse rounded bg-zinc-800" />
                      </span>
                    ) : (
                      <VisualGlow value={cache.detail} className={`mt-2 block text-[15px] font-bold tabular-nums ${cache.toneClass}`}>
                        {cache.detail}
                      </VisualGlow>
                    )}
                  </div>

                  <div className="px-1 py-1">
                    <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500/80">
                      UPTIME
                    </span>
                    <VisualGlow value={m.uptime_pct} className={`mt-2 block text-[15px] font-bold tabular-nums ${uptimeTone(uptimePct)}`}>
                      {uptimePct != null ? `${uptimePct}%` : '—'}
                    </VisualGlow>
                  </div>

                  <div className="px-1 py-1">
                    <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500/80">
                      REDIRECTS
                    </span>
                    <span className={`mt-2 block text-[15px] font-bold tabular-nums ${redirectTone(redirectCount)}`}>
                      {redirectCount ?? '—'}
                    </span>
                  </div>

                  <div className="px-1 py-1">
                    <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500/80">
                      ISSUES
                    </span>
                    <span className={`mt-2 block text-[15px] font-bold tabular-nums ${problems.toneClass}`}>
                      {totalProblems}
                    </span>
                  </div>

                  <div className="px-1 py-1">
                    <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500/80">
                      SECURITY
                    </span>
                    <span className={`mt-2 block text-[15px] font-bold tabular-nums ${securityTone(securityScore)}`}>
                      {securityScore != null ? `${securityScore}/9` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
