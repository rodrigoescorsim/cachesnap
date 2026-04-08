import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import { TtfbChart, type ChartPoint } from './ttfb-chart'
import { MonitorActions } from './monitor-actions'
import { extractPop, detectCdn } from '@/lib/edge-helpers'

interface RegionStat {
  region: string
  probe_count: number
  ttfb_avg_ms: number | null
  ttfb_p95_ms: number | null
  ttfb_min_ms: number | null
  ttfb_max_ms: number | null
  total_avg_ms: number | null
  edge_avg_ms: number | null
  origin_avg_ms: number | null
  redirect_avg: number | null
  common_served_by: string | null
  common_http_version: string | null
  common_cache_status: string | null
  error_count: number
  cache_hit_pct: number | null
  uptime_pct: number | null
  max_age_s: number | null
  last_probe_at: Date | null
}

interface WeekTrend {
  region: string
  current_avg_ms: number
  previous_avg_ms: number
  change_pct: number
}

interface SecurityHeaders {
  hsts: string | null
  csp: string | null
  x_frame_options: string | null
  x_content_type: string | null
  referrer_policy: string | null
  score: number
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

const SECURITY_HEADERS_LABELS: Array<{ key: keyof SecurityHeaders; label: string }> = [
  { key: 'hsts', label: 'HSTS' },
  { key: 'csp', label: 'CSP' },
  { key: 'x_frame_options', label: 'X-Frame-Options' },
  { key: 'x_content_type', label: 'X-Content-Type' },
  { key: 'referrer_policy', label: 'Referrer-Policy' },
]

function ttfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms < 200) return 'text-emerald-500'
  if (ms < 500) return 'text-green-500'
  if (ms < 800) return 'text-amber-500'
  return 'text-red-500'
}

function uptimeColor(pct: number | null): string {
  if (pct == null) return 'text-zinc-400'
  if (pct >= 99.9) return 'text-emerald-500'
  if (pct >= 99) return 'text-green-500'
  if (pct >= 95) return 'text-amber-500'
  return 'text-red-500'
}

function redirectDisplay(redirectAvg: number | string | null): { text: string; tone: string } {
  if (redirectAvg == null) {
    return { text: '—', tone: 'text-zinc-400' }
  }

  const value = Number(redirectAvg)
  if (Number.isNaN(value)) {
    return { text: '—', tone: 'text-zinc-400' }
  }

  if (value === 0) {
    return { text: '0', tone: 'text-emerald-600 dark:text-emerald-400' }
  }

  if (value <= 2) {
    return { text: `${value}`, tone: 'text-amber-500 font-medium' }
  }

  return { text: `${value}`, tone: 'text-red-500 font-medium' }
}

function cacheDisplay(status: string | null, hitPct: number | null): { text: string; tone: string; title: string } {
  const normalizedStatus = status?.toUpperCase() ?? null

  if (normalizedStatus === 'HIT') {
    return {
      text: hitPct != null ? `${hitPct}% hit rate` : 'HIT',
      tone: 'text-emerald-500',
      title: 'Cache hit observed',
    }
  }

  if (normalizedStatus === 'MISS') {
    return {
      text: 'MISS',
      tone: 'text-amber-500',
      title: 'Cache miss observed',
    }
  }

  if (normalizedStatus === 'DYNAMIC' || normalizedStatus === 'BYPASS') {
    return {
      text: 'Dynamic',
      tone: 'text-zinc-500 dark:text-zinc-400',
      title: 'No cacheable response signal',
    }
  }

  if (hitPct === 0) {
    return {
      text: 'No cache signal',
      tone: 'text-zinc-400',
      title: 'No cache headers were observed',
    }
  }

  if (hitPct != null) {
    return {
      text: `${hitPct}% hit rate`,
      tone: hitPct > 70 ? 'text-emerald-500' : hitPct >= 30 ? 'text-amber-500' : 'text-red-500',
      title: 'Calculated from observed probe responses',
    }
  }

  return {
    text: 'No cache signal',
    tone: 'text-zinc-400',
    title: 'No cache headers were observed',
  }
}

function serverTimingDisplay(ms: number | null): { text: string; tone: string; title: string } {
  if (ms == null) {
    return {
      text: 'Timing not exposed',
      tone: 'text-zinc-400',
      title: 'The site did not expose Server-Timing or X-Timer headers',
    }
  }

  if (ms === 0) {
    return {
      text: 'No timing signal',
      tone: 'text-zinc-400',
      title: 'Timing was not exposed in a meaningful way',
    }
  }

  return {
    text: `${ms}ms`,
    tone: ttfbColor(ms),
    title: 'Parsed from Server-Timing or X-Timer',
  }
}

function trendColor(pct: number): string {
  if (pct <= -5) return 'text-emerald-500'   // faster — good
  if (pct >= 10) return 'text-red-500'        // slower — bad
  return 'text-zinc-400'                      // stable
}

function trendArrow(pct: number): string {
  if (pct <= -5) return '↓'
  if (pct >= 10) return '↑'
  return '→'
}

function formatDate(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatAge(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function scoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 2) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
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

  const [monitor] = await sql<{
    id: string; url: string; name: string | null; is_active: boolean; alert_threshold_ms: number;
    notify_email: string | null; notify_email_enabled: boolean;
    notify_slack_webhook: string | null; notify_slack_enabled: boolean;
  }[]>`
    SELECT id, url, name, is_active, alert_threshold_ms,
           notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled
    FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) notFound()

  const stats = await sql<RegionStat[]>`
    SELECT
      region,
      COUNT(*)::int                              AS probe_count,
      ROUND(AVG(ttfb_ms)::numeric, 1)            AS ttfb_avg_ms,
      ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)::numeric, 1
      )                                          AS ttfb_p95_ms,
      ROUND(MIN(ttfb_ms)::numeric, 1)            AS ttfb_min_ms,
      ROUND(MAX(ttfb_ms)::numeric, 1)            AS ttfb_max_ms,
      ROUND(AVG(total_ms)::numeric, 1)           AS total_avg_ms,
      ROUND(AVG(edge_ms)::numeric, 1)            AS edge_avg_ms,
      ROUND(AVG(origin_ms)::numeric, 1)          AS origin_avg_ms,
      ROUND(AVG(redirect_count)::numeric, 0)     AS redirect_avg,
      MODE() WITHIN GROUP (ORDER BY served_by)    AS common_served_by,
      MODE() WITHIN GROUP (ORDER BY http_version) AS common_http_version,
      MODE() WITHIN GROUP (ORDER BY cache_status) AS common_cache_status,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS error_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE cache_status ILIKE '%HIT%') / NULLIF(COUNT(*), 0), 1
      )                                          AS cache_hit_pct,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE error IS NULL AND status_code < 500)
               / NULLIF(COUNT(*), 0), 2
      )                                          AS uptime_pct,
      MAX(age_s)::int                            AS max_age_s,
      MAX(time)                                  AS last_probe_at
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

  // Week-over-week TTFB trend (last 7 days vs prior 7 days)
  const weekTrend = await sql<WeekTrend[]>`
    WITH current_week AS (
      SELECT region, AVG(ttfb_ms) AS ttfb_avg
      FROM probe_results
      WHERE monitor_id = ${id}
        AND time > NOW() - INTERVAL '7 days'
        AND ttfb_ms IS NOT NULL
      GROUP BY region
    ),
    previous_week AS (
      SELECT region, AVG(ttfb_ms) AS ttfb_avg
      FROM probe_results
      WHERE monitor_id = ${id}
        AND time > NOW() - INTERVAL '14 days'
        AND time <= NOW() - INTERVAL '7 days'
        AND ttfb_ms IS NOT NULL
      GROUP BY region
    )
    SELECT
      c.region,
      ROUND(c.ttfb_avg::numeric, 0)::int        AS current_avg_ms,
      ROUND(p.ttfb_avg::numeric, 0)::int        AS previous_avg_ms,
      ROUND(
        (100.0 * (c.ttfb_avg - p.ttfb_avg) / NULLIF(p.ttfb_avg, 0))::numeric, 1
      )                                          AS change_pct
    FROM current_week c
    JOIN previous_week p USING (region)
    ORDER BY change_pct DESC
  `

  // Latest security headers audit (same for all regions — take most recent non-null)
  const [secRow] = await sql<{ security_headers: SecurityHeaders }[]>`
    SELECT security_headers
    FROM probe_results
    WHERE monitor_id = ${id}
      AND security_headers IS NOT NULL
    ORDER BY time DESC
    LIMIT 1
  `
  const security: SecurityHeaders | null = secRow?.security_headers ?? null

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
      <AutoRefresh />
      {/* Breadcrumb + title */}
      <div>
        <nav className="text-xs text-zinc-400 mb-2">
          <Link href="/dashboard" className="hover:underline">Overview</Link>
          {' / '}
          <span className="text-zinc-600 dark:text-zinc-300">{monitor.name ?? new URL(monitor.url).hostname}</span>
        </nav>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {monitor.name ?? new URL(monitor.url).hostname}
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">{monitor.url}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <MonitorActions
              id={monitor.id}
              name={monitor.name}
              alertThresholdMs={monitor.alert_threshold_ms}
              isActive={monitor.is_active}
              notifyEmail={monitor.notify_email}
              notifyEmailEnabled={monitor.notify_email_enabled}
              notifySlackWebhook={monitor.notify_slack_webhook}
              notifySlackEnabled={monitor.notify_slack_enabled}
            />
            {/* Detected infrastructure + security score */}
            {(() => {
              const cdn = stats.map(s => detectCdn(s.common_served_by)).find(Boolean) ?? null
              const pops = [...new Set(
                stats.map(s => extractPop(s.common_served_by)).filter((p): p is string => p != null)
              )]
              // Pick the most common cache status across all regions (normalize to uppercase)
              const rawCache = stats.map(s => s.common_cache_status).find(Boolean) ?? null
              const cacheStatus = rawCache?.toUpperCase() ?? null

              if (pops.length === 0 && !cacheStatus && !security) return null

              const cacheClass = cacheStatus === 'HIT'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                : cacheStatus === 'MISS'
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                : cacheStatus === 'DYNAMIC'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'

              return (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {pops.map(pop => (
                      <span key={pop} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {pop} PoP
                      </span>
                    ))}
                    {cacheStatus && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border ${cacheClass}`}>
                        {cacheStatus}
                      </span>
                    )}
                    {security && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border ${
                        security.score >= 4
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                          : security.score >= 2
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50'
                      }`}>
                        Security {security.score}/5
                      </span>
                    )}
                  </div>
                  {cdn && (
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Via {cdn}</p>
                  )}
                </div>
              )
            })()}
          </div>
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
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">P95</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">min/max</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Edge</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Origin</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Hops</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Cache</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Uptime</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">HTTP</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Errors</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Last probe</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => {
                  const ageLabel = formatAge(s.max_age_s)
                  const isZombie = s.max_age_s != null && s.max_age_s > 86400
                  return (
                    <tr
                      key={s.region}
                      className={i < stats.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {REGION_LABELS[s.region] ?? s.region}
                        </span>
                        {(() => {
                          const pop = extractPop(s.common_served_by)
                          return pop ? (
                            <span className="block text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mt-0.5 bg-zinc-100 dark:bg-zinc-800/50 px-1 py-0.5 rounded w-fit">
                              {pop} PoP
                            </span>
                          ) : null
                        })()}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${ttfbColor(s.ttfb_avg_ms)}`}>
                        {s.ttfb_avg_ms != null ? `${s.ttfb_avg_ms}ms` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-xs ${ttfbColor(s.ttfb_p95_ms)}`}>
                        {s.ttfb_p95_ms != null ? `${s.ttfb_p95_ms}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400 tabular-nums">
                        {s.ttfb_min_ms != null ? `${s.ttfb_min_ms} / ${s.ttfb_max_ms}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const edge = serverTimingDisplay(s.edge_avg_ms)
                          return (
                            <span className={`text-xs tabular-nums ${edge.tone}`} title={edge.title}>
                              {edge.text}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const origin = serverTimingDisplay(s.origin_avg_ms)
                          return (
                            <span className={`text-xs tabular-nums ${origin.tone}`} title={origin.title}>
                              {origin.text}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const redirects = redirectDisplay(s.redirect_avg)
                          return (
                            <span className={`text-xs tabular-nums ${redirects.tone}`}>
                              {redirects.text}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const cache = cacheDisplay(s.common_cache_status, s.cache_hit_pct)
                          return (
                            <span className={`text-xs tabular-nums ${cache.tone}`} title={cache.title}>
                              {cache.text}
                            </span>
                          )
                        })()}
                        {ageLabel && (
                          <span
                            className={`block text-[10px] tabular-nums mt-0.5 ${isZombie ? 'text-amber-500 font-medium' : 'text-zinc-400'}`}
                            title={`Age header: ${s.max_age_s}s${isZombie ? ' — zombie cache detected' : ''}`}
                          >
                            Age {ageLabel}{isZombie ? ' ⚠' : ''}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-xs font-medium ${uptimeColor(s.uptime_pct)}`}>
                        {s.uptime_pct != null ? `${s.uptime_pct}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.common_http_version ? (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            s.common_http_version === 'HTTP/1.1'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              : s.common_http_version === 'HTTP/3'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            {s.common_http_version === 'HTTP/1.1' ? '1.1' : s.common_http_version === 'HTTP/3' ? 'H3' : 'H2'}
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right ${s.error_count > 0 ? 'text-red-500 font-medium' : 'text-zinc-400'}`}>
                        {s.error_count}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">
                        {formatDate(s.last_probe_at)}
                      </td>
                    </tr>
                  )
                })}
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

      {/* Week-over-week trend */}
      {weekTrend.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Week-over-week trend
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {weekTrend.map(t => (
              <div key={t.region} className="flex items-center justify-between px-4 py-3 gap-4">
                <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium min-w-[120px]">
                  {REGION_LABELS[t.region] ?? t.region}
                </span>
                <div className="flex items-center gap-3 tabular-nums text-sm">
                  <span className="text-zinc-400 text-xs">{t.previous_avg_ms}ms → {t.current_avg_ms}ms</span>
                  <span className={`font-semibold ${trendColor(t.change_pct)}`}>
                    {trendArrow(t.change_pct)}{' '}
                    {t.change_pct > 0 ? '+' : ''}{t.change_pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">Comparing last 7 days vs the prior 7 days.</p>
        </section>
      )}

      {/* Security headers audit */}
      {security && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Security headers
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-2xl font-bold tabular-nums ${scoreColor(security.score)}`}>
                {security.score}<span className="text-base font-normal text-zinc-400">/5</span>
              </span>
              <span className="text-sm text-zinc-500">
                {security.score === 5
                  ? 'All security headers present'
                  : security.score >= 3
                  ? 'Some security headers missing'
                  : 'Critical security headers missing'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SECURITY_HEADERS_LABELS.map(({ key, label }) => {
                const value = security[key]
                const present = value != null && value !== 0
                return (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ${
                      present
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50'
                    }`}
                    title={present ? String(value) : undefined}
                  >
                    <span>{present ? '✓' : '✗'}</span>
                    {label}
                  </span>
                )
              })}
            </div>
          </div>
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
                      <span className="capitalize">{a.alert_type.replace('_', ' ')}</span>
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
