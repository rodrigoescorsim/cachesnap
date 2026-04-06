import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import { TtfbChart, type ChartPoint } from './ttfb-chart'

interface RegionStat {
  region: string
  probe_count: number
  ttfb_avg_ms: number | null
  ttfb_min_ms: number | null
  ttfb_max_ms: number | null
  total_avg_ms: number | null
  edge_avg_ms: number | null
  origin_avg_ms: number | null
  redirect_avg: number | null
  common_served_by: string | null
  error_count: number
  cache_hit_pct: number | null
  last_probe_at: Date | null
}

interface Alert {
  id: string
  region: string
  alert_type: string
  metric: string
  baseline_ms: number | null
  actual_ms: number | null
  deviation_factor: number | null
  diagnosis: string | null
  action: string | null
  estimated_gain_ms: number | null
  created_at: Date
}

const REGION_LABELS: Record<string, string> = {
  'sa-east': 'South America',
  'eu-west': 'Europe',
  'us-east': 'US East',
  'ap-east': 'Asia Pacific',
  'oc': 'Oceania',
}

function ttfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms < 200) return 'text-emerald-500'
  if (ms < 500) return 'text-green-500'
  if (ms < 800) return 'text-amber-500'
  return 'text-red-500'
}

function formatDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function MonitorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const user = await getSession()
  if (!user) return null

  const { id } = await params
  const { range = '24h' } = await searchParams

  const [monitor] = await sql<{ id: string; url: string; name: string | null; is_active: boolean; alert_threshold_ms: number }[]>`
    SELECT id, url, name, is_active, alert_threshold_ms
    FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) notFound()

  const stats = await sql<RegionStat[]>`
    SELECT
      region,
      COUNT(*)::int                         AS probe_count,
      ROUND(AVG(ttfb_ms)::numeric, 1)       AS ttfb_avg_ms,
      ROUND(MIN(ttfb_ms)::numeric, 1)       AS ttfb_min_ms,
      ROUND(MAX(ttfb_ms)::numeric, 1)       AS ttfb_max_ms,
      ROUND(AVG(total_ms)::numeric, 1)      AS total_avg_ms,
      ROUND(AVG(edge_ms)::numeric, 1)       AS edge_avg_ms,
      ROUND(AVG(origin_ms)::numeric, 1)     AS origin_avg_ms,
      ROUND(AVG(redirect_count)::numeric, 0) AS redirect_avg,
      MODE() WITHIN GROUP (ORDER BY served_by) AS common_served_by,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS error_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE cache_status ILIKE '%HIT%') / NULLIF(COUNT(*), 0), 1
      )                                     AS cache_hit_pct,
      MAX(time)                             AS last_probe_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - INTERVAL '24 hours'
    GROUP BY region ORDER BY region
  `

  const alerts = await sql<Alert[]>`
    SELECT id, region, alert_type, metric, baseline_ms, actual_ms,
           deviation_factor, diagnosis, action, estimated_gain_ms, created_at
    FROM alerts WHERE monitor_id = ${id}
    ORDER BY created_at DESC LIMIT 20
  `

  // Série temporal para o gráfico — bucket size varia com o range selecionado
  const chartRaw = range === '7d'
    ? await sql<{ bucket: Date; region: string; ttfb_avg: number }[]>`
        SELECT
          time_bucket('6 hours', time) AS bucket,
          region,
          ROUND(AVG(ttfb_ms)::numeric, 0) AS ttfb_avg
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - INTERVAL '7 days'
          AND ttfb_ms IS NOT NULL
        GROUP BY bucket, region
        ORDER BY bucket ASC, region ASC
      `
    : await sql<{ bucket: Date; region: string; ttfb_avg: number }[]>`
        SELECT
          time_bucket('30 minutes', time) AS bucket,
          region,
          ROUND(AVG(ttfb_ms)::numeric, 0) AS ttfb_avg
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - INTERVAL '24 hours'
          AND ttfb_ms IS NOT NULL
        GROUP BY bucket, region
        ORDER BY bucket ASC, region ASC
      `

  // Converter Date → ISO string para serialização Server→Client Component
  const chartPoints: ChartPoint[] = chartRaw.map(row => ({
    bucket: row.bucket.toISOString(),
    region: row.region,
    ttfb_avg: Number(row.ttfb_avg),
  }))

  return (
    <div className="space-y-8">
      <AutoRefresh hasData={stats.length > 0} />
      {/* Breadcrumb + title */}
      <div>
        <nav className="text-xs text-zinc-400 mb-2">
          <Link href="/dashboard" className="hover:underline">Overview</Link>
          {' / '}
          <span className="text-zinc-600 dark:text-zinc-300">{monitor.name ?? new URL(monitor.url).hostname}</span>
        </nav>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {monitor.name ?? new URL(monitor.url).hostname}
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">{monitor.url}</p>
          </div>
          <span className={`text-sm font-medium shrink-0 ${monitor.is_active ? 'text-emerald-500' : 'text-zinc-400'}`}>
            {monitor.is_active ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Region stats table */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Performance by region — last 24h
        </h2>
        {stats.length === 0 ? (
          <p className="text-sm text-zinc-400">No probe data yet. Results will appear within 5 minutes.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Region</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">TTFB avg</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">TTFB min/max</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Edge</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Origin</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Hops</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Cache hit</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Errors</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Last probe</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr
                    key={s.region}
                    className={i < stats.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {REGION_LABELS[s.region] ?? s.region}
                      </span>
                      {s.common_served_by && (
                        <span className="block text-xs text-zinc-400 mt-0.5">{s.common_served_by}</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${ttfbColor(s.ttfb_avg_ms)}`}>
                      {s.ttfb_avg_ms != null ? `${s.ttfb_avg_ms}ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-400 tabular-nums">
                      {s.ttfb_min_ms != null ? `${s.ttfb_min_ms} / ${s.ttfb_max_ms}ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      {s.edge_avg_ms != null ? `${s.edge_avg_ms}ms` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs tabular-nums ${ttfbColor(s.origin_avg_ms)}`}>
                      {s.origin_avg_ms != null ? `${s.origin_avg_ms}ms` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs tabular-nums ${(s.redirect_avg ?? 0) > 0 ? 'text-amber-500 font-medium' : 'text-zinc-400'}`}>
                      {(s.redirect_avg ?? 0) > 0 ? s.redirect_avg : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                      {s.cache_hit_pct != null ? `${s.cache_hit_pct}%` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right ${s.error_count > 0 ? 'text-red-500 font-medium' : 'text-zinc-400'}`}>
                      {s.error_count}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-400">
                      {formatDate(s.last_probe_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* TTFB Timeline */}
      {stats.length > 0 && (
        <section>
          <TtfbChart data={chartPoints} range={range} />
        </section>
      )}

      {/* Alerts */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Recent alerts
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-zinc-400">No alerts yet.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map(a => (
              <div
                key={a.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      <span className="capitalize">{a.alert_type}</span>
                      {' · '}
                      <span className="text-zinc-500">{REGION_LABELS[a.region] ?? a.region}</span>
                    </p>
                    {a.diagnosis && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{a.diagnosis}</p>
                    )}
                    {a.action && (
                      <p className="text-sm text-blue-600 dark:text-blue-400">{a.action}</p>
                    )}
                    {a.deviation_factor != null && (
                      <p className="text-xs text-zinc-400">
                        {a.actual_ms}ms vs {a.baseline_ms}ms baseline ({a.deviation_factor.toFixed(1)}x slower)
                      </p>
                    )}
                    {(a.estimated_gain_ms != null || (a.actual_ms != null && a.baseline_ms != null && a.actual_ms > a.baseline_ms)) && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Fix this to recover ~{Math.round(a.estimated_gain_ms ?? (a.actual_ms! - a.baseline_ms!))}ms
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{formatDate(a.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
