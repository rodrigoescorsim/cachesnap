import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
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
                  {(m.error_count + m.alert_count) > 0 && ` — ${m.error_count + m.alert_count} problema${m.error_count + m.alert_count > 1 ? 's' : ''}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Seus sites monitorados
          <span className="ml-2 text-sm font-normal text-zinc-400">({monitors.length})</span>
        </h2>
        <Link
          href="/dashboard/monitors/new"
          className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          Adicionar site
        </Link>
      </div>

      {/* Monitor cards */}
      {monitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 py-16 text-center">
          <p className="text-sm text-zinc-500">Você ainda não está monitorando nenhum site.</p>
          <Link
            href="/dashboard/monitors/new"
            className="mt-3 inline-block text-sm font-medium text-zinc-900 dark:text-zinc-50 hover:underline"
          >
            Adicionar primeiro site
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {monitors.map(m => {
            const speed = speedSummary(m)
            const cache = cacheSummary(m)
            const problems = problemsSummary(m)
            const totalProblems = m.error_count + m.alert_count

            return (
              <Link
                key={m.id}
                href={`/dashboard/monitors/${m.id}`}
                className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                      {m.name ?? new URL(m.url).hostname}
                    </p>
                    <p className="truncate text-xs text-zinc-400 mt-0.5">{m.url}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Velocidade</span>
                    <span className={`text-right font-medium ${speed.toneClass}`}>
                      {speed.detail}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Uso de cache</span>
                    <span className={`text-right font-medium ${cache.toneClass}`}>
                      {cache.detail}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Problemas</span>
                    <span className={`text-right font-medium ${problems.toneClass}`}>
                      {totalProblems === 0
                        ? '0 nas últimas 24h'
                        : `${totalProblems} ocorrência${totalProblems > 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Ver detalhes
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
