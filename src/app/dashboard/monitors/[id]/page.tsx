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
  bypass_ttfb_avg_ms: number | null
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

interface Spike {
  bucket: Date
  region: string
  ttfb_avg: number
  prev_avg: number
  spike_ms: number
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
  created_at: Date
}

interface SecurityByRegion {
  region: string
  security_headers: SecurityHeaders | null
  server_timing_breakdown: Record<string, number> | null
  sampled_at: Date
}

const REGION_LABELS: Record<string, string> = {
  'sa-east': 'South America',
  'eu-west': 'Europe',
  'us-east': 'US East',
  'ap-east': 'Asia Pacific',
  'oc': 'Oceania',
}

const VALID_TABS = ['performance', 'cache', 'security', 'alerts'] as const
type MonitorTab = (typeof VALID_TABS)[number]

const TAB_LABELS: Record<MonitorTab, string> = {
  performance: 'Performance',
  cache: 'Cache',
  security: 'Security',
  alerts: 'Alerts',
}

const TAB_GROUPS: Array<{ label: string; tabs: MonitorTab[] }> = [
  { label: 'Observe', tabs: ['performance', 'cache', 'security'] },
  { label: 'Respond', tabs: ['alerts'] },
]

const VALID_ALERT_TYPES = ['down', 'anomaly', 'anycast', 'zombie_cache'] as const
type AlertType = (typeof VALID_ALERT_TYPES)[number]

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  down: 'Down',
  anomaly: 'Anomaly',
  anycast: 'Anycast',
  zombie_cache: 'Zombie cache',
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
  if (pct <= -5) return 'â†“'
  if (pct >= 10) return 'â†‘'
  return 'â†’'
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

function readFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function normalizeTab(value: string | undefined): MonitorTab {
  return VALID_TABS.includes((value ?? '') as MonitorTab) ? (value as MonitorTab) : 'performance'
}

function normalizeAlertType(value: string | undefined): AlertType | null {
  return VALID_ALERT_TYPES.includes((value ?? '') as AlertType) ? (value as AlertType) : null
}

function buildMonitorHref(tab: MonitorTab, range: string, alertType: AlertType | null = null): string {
  const params = new URLSearchParams()
  if (tab !== 'performance') params.set('tab', tab)
  if (range === '7d') params.set('range', '7d')
  if (tab === 'alerts' && alertType) params.set('alert_type', alertType)
  const query = params.toString()
  return query ? `?${query}` : '?'
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function timingBreakdownEntries(raw: Record<string, number> | null): Array<[string, number]> {
  if (!raw) return []
  return Object.entries(raw)
    .map(([metric, value]) => [metric, Number(value)] as [string, number])
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1])
}

function formatMs(value: number | null): string {
  if (value == null) return '-'
  return `${Math.round(value)}ms`
}

export default async function MonitorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string | string[]; tab?: string | string[]; alert_type?: string | string[] }>
}) {
  const user = await getSession()
  if (!user) return null

  const { id } = await params
  const rawSearchParams = await searchParams
  const rangeValue = readFirst(rawSearchParams.range)
  const tabValue = readFirst(rawSearchParams.tab)
  const alertTypeValue = readFirst(rawSearchParams.alert_type)

  const range = rangeValue === '7d' ? '7d' : '24h'
  const activeTab = normalizeTab(tabValue)
  const filteredAlertType = normalizeAlertType(alertTypeValue)

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
      ROUND(AVG(bypass_ttfb_ms)::numeric, 1)     AS bypass_ttfb_avg_ms,
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

  const alerts = filteredAlertType
    ? await sql<Alert[]>`
        SELECT id, region, alert_type, metric, baseline_ms, actual_ms, deviation_factor, created_at
        FROM alerts
        WHERE monitor_id = ${id} AND alert_type = ${filteredAlertType}
        ORDER BY created_at DESC
        LIMIT 100
      `
    : await sql<Alert[]>`
        SELECT id, region, alert_type, metric, baseline_ms, actual_ms, deviation_factor, created_at
        FROM alerts
        WHERE monitor_id = ${id}
        ORDER BY created_at DESC
        LIMIT 100
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
  const [secRow] = await sql<{ security_headers: SecurityHeaders | null }[]>`
    SELECT security_headers
    FROM probe_results
    WHERE monitor_id = ${id}
      AND security_headers IS NOT NULL
    ORDER BY time DESC
    LIMIT 1
  `
  const security: SecurityHeaders | null = secRow?.security_headers ?? null

  // SÃ©rie temporal para o grÃ¡fico — bucket size varia com o range selecionado
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

  const spikes = await sql<Spike[]>`
    WITH bucketed AS (
      SELECT
        time_bucket('30 minutes', time) AS bucket,
        region,
        ROUND(AVG(ttfb_ms)::numeric, 0) AS ttfb_avg
      FROM probe_results
      WHERE monitor_id = ${id}
        AND time > NOW() - INTERVAL '24 hours'
        AND ttfb_ms IS NOT NULL
      GROUP BY bucket, region
    ),
    with_lag AS (
      SELECT
        bucket,
        region,
        ttfb_avg,
        LAG(ttfb_avg) OVER (PARTITION BY region ORDER BY bucket) AS prev_avg
      FROM bucketed
    )
    SELECT
      bucket,
      region,
      ttfb_avg::int,
      prev_avg::int,
      (ttfb_avg - prev_avg)::int AS spike_ms
    FROM with_lag
    WHERE prev_avg IS NOT NULL
      AND ttfb_avg > prev_avg * 1.5
      AND (ttfb_avg - prev_avg) > 100
    ORDER BY spike_ms DESC
    LIMIT 5
  `

  const securityByRegion = await sql<SecurityByRegion[]>`
    SELECT DISTINCT ON (region)
      region,
      security_headers,
      server_timing_breakdown,
      time AS sampled_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - INTERVAL '24 hours'
      AND (security_headers IS NOT NULL OR server_timing_breakdown IS NOT NULL)
    ORDER BY region, time DESC
  `

  const monitorHostname = safeHostname(monitor.url)

  const cacheStatsByRegion = new Map(stats.map(row => [row.region, row]))
  const cacheRegions = [...new Set(stats.map(row => row.region))].sort()
  const hasBypassComparison = stats.some(row => row.bypass_ttfb_avg_ms != null)

  // Converter Date â†’ ISO string para serializaÃ§Ã£o Serverâ†’Client Component
  const chartPoints: ChartPoint[] = chartRaw.map(row => ({
    bucket: row.bucket.toISOString(),
    region: row.region,
    ttfb_avg: Number(row.ttfb_avg),
  }))

  const monitorDisplayName = monitor.name ?? monitorHostname ?? monitor.url
  const securityRowsWithTiming = securityByRegion.filter(row => timingBreakdownEntries(row.server_timing_breakdown).length > 0)
  const totalProbes = stats.reduce((sum, s) => sum + s.probe_count, 0)
  const isCollecting = totalProbes < 3

  return (
    <div className="space-y-8">
      <AutoRefresh />
      {/* Monitor title header */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/30 px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[40px] leading-[0.96] font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50">
              {monitorDisplayName}
            </h1>
            <p className="text-sm text-zinc-400 mt-1.5 truncate">{monitor.url}</p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {(() => {
              const cdn = stats.map(s => detectCdn(s.common_served_by)).find(Boolean) ?? null
              const pops = [...new Set(
                stats.map(s => extractPop(s.common_served_by)).filter((p): p is string => p != null)
              )]
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
              const cdnHint = cdn ? `Via ${cdn}` : undefined
              const securityHint = security
                ? SECURITY_HEADERS_LABELS.map(({ key, label }) => {
                    const value = security[key]
                    const present = value != null && value !== 0
                    return `${label}: ${present ? 'present' : 'missing'}`
                  }).join(' | ')
                : undefined

              return (
                <>
                  {pops.map(pop => (
                    <span key={pop} title={cdnHint} className="inline-flex h-7 items-center rounded-md px-2.5 bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      {pop} PoP
                    </span>
                  ))}
                  {cacheStatus && (
                    <span title={cdnHint} className={`inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-bold uppercase tracking-tight border ${cacheClass}`}>
                      {cacheStatus}
                    </span>
                  )}
                  {security && (
                    <span title={securityHint} className={`inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-bold uppercase tracking-tight border ${
                      security.score >= 4
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                        : security.score >= 2
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50'
                    }`}>
                      Security {security.score}/5
                    </span>
                  )}
                </>
              )
            })()}

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
          </div>
        </div>
      </div>

      {isCollecting && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-3">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Collecting data</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              We&apos;re running the first probes. Results will appear within 5 minutes. Stats below may not be representative yet.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <nav aria-label="Monitor sections" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/30 p-3">
            <div className="px-2 pb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Monitor
              </p>
              <p className="mt-2 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {monitorDisplayName}
              </p>
            </div>

            <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-3">
              {TAB_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="px-2 pb-1.5 text-[11px] font-medium text-zinc-400">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.tabs.map(tab => (
                      <li key={tab}>
                        <Link
                          href={buildMonitorHref(tab, range, tab === 'alerts' ? filteredAlertType : null)}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            activeTab === tab
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800'
                              : 'text-zinc-600 dark:text-zinc-300 hover:bg-white/80 dark:hover:bg-zinc-950/70 hover:text-zinc-900 dark:hover:text-zinc-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                activeTab === tab
                                  ? 'bg-zinc-900 dark:bg-zinc-100'
                                  : 'bg-zinc-300 dark:bg-zinc-700'
                              }`}
                            />
                            <span>{TAB_LABELS[tab]}</span>
                          </span>
                          <span className="text-xs text-zinc-400">›</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
      {/* Region stats table */}
      {activeTab === 'performance' && (
      <>
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
                            Age {ageLabel}{isZombie ? ' âš ' : ''}
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

      {spikes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Recent spikes - last 24h
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {spikes.map((spike, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2.5 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 text-xs font-mono text-zinc-400 w-[38px]">
                    {new Date(spike.bucket).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                    {REGION_LABELS[spike.region] ?? spike.region}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums text-xs">
                  <span className="text-zinc-400">{spike.prev_avg}ms to {spike.ttfb_avg}ms</span>
                  <span className="font-semibold text-amber-500">+{spike.spike_ms}ms</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">Detected when TTFB increased by more than 50% between consecutive 30-minute windows.</p>
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
                  <span className="text-zinc-400 text-xs">{t.previous_avg_ms}ms â†’ {t.current_avg_ms}ms</span>
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
      </>
      )}

      {activeTab === 'cache' && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Cache behavior by region - last 24h
          </h2>
          {stats.length === 0 ? (
            <p className="text-sm text-zinc-400">No probe data yet. Results will appear within 5 minutes.</p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Region</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Most common cache status in the last 24h">
                        Cache
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Hit rate</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Highest HTTP Age header seen in this region over the last 24h">
                        Max age (24h)
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Average TTFB from the standard monitor URL">
                        TTFB normal
                      </th>
                      {hasBypassComparison && (
                        <>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Average TTFB from native bypass requests (cache-bypass query param)">
                            TTFB bypass
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Cache delta = TTFB bypass - TTFB normal">
                            Cache delta
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {cacheRegions.map((region, index) => {
                      const normal = cacheStatsByRegion.get(region) ?? null
                      const cache = normal ? cacheStatusLabel(normal.common_cache_status) : null
                      const ageLabel = formatAge(normal?.max_age_s ?? null)
                      const cacheDelta =
                        normal?.ttfb_avg_ms != null && normal?.bypass_ttfb_avg_ms != null
                          ? Number((normal.bypass_ttfb_avg_ms - normal.ttfb_avg_ms).toFixed(1))
                          : null
                      const cacheDeltaTone =
                        cacheDelta == null
                          ? 'text-zinc-400'
                          : cacheDelta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : cacheDelta < 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-zinc-500'

                      return (
                        <tr key={region} className={index < cacheRegions.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}>
                          <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">
                            {REGION_LABELS[region] ?? region}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {cache ? (
                              <span className={cache.tone} title={cache.title}>{cache.text}</span>
                            ) : (
                              <span className="text-zinc-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums">
                            {normal?.cache_hit_pct != null ? `${normal.cache_hit_pct}%` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums">
                            {ageLabel ? ageLabel : '-'}
                          </td>
                          <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${ttfbColor(normal?.ttfb_avg_ms ?? null)}`}>
                            {normal?.ttfb_avg_ms != null ? `${normal.ttfb_avg_ms}ms` : '-'}
                          </td>
                          {hasBypassComparison && (
                            <>
                              <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${ttfbColor(normal?.bypass_ttfb_avg_ms ?? null)}`}>
                                {normal?.bypass_ttfb_avg_ms != null ? `${normal.bypass_ttfb_avg_ms}ms` : '-'}
                              </td>
                              <td
                                className={`px-4 py-3 text-right text-xs tabular-nums font-semibold ${cacheDeltaTone}`}
                                title={
                                  cacheDelta == null
                                    ? undefined
                                    : cacheDelta > 0
                                    ? 'Bypass is slower than normal; cache is likely helping.'
                                    : cacheDelta < 0
                                    ? 'Bypass is faster than normal; verify route parity and sample window.'
                                    : 'No measurable delta between normal and bypass.'
                                }
                              >
                                {cacheDelta != null ? `${cacheDelta > 0 ? '+' : ''}${cacheDelta}ms` : '-'}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {hasBypassComparison && (
                <p className="text-xs text-zinc-400">
                  Cache delta formula: TTFB bypass - TTFB normal. Positive means cache is likely helping. Negative means bypass was faster in this window.
                </p>
              )}
              {!hasBypassComparison && (
                <p className="text-xs text-zinc-400">
                  Bypass metrics are enabled by default, waiting for enough samples in this 24h window.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'security' && (
        <section className="space-y-5">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Security and server timing
          </h2>

          {!security && securityByRegion.length === 0 && (
            <p className="text-sm text-zinc-400">No security or server-timing data yet.</p>
          )}

          {security && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-2xl font-bold tabular-nums ${scoreColor(security.score)}`}>
                  {security.score}<span className="text-base font-normal text-zinc-400">/5</span>
                </span>
                <span className="text-sm text-zinc-500">Latest observed security headers score.</span>
              </div>
            </div>
          )}

          {securityByRegion.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Region</th>
                    {SECURITY_HEADERS_LABELS.map(({ label }) => (
                      <th key={label} className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">{label}</th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Score</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Sampled at</th>
                  </tr>
                </thead>
                <tbody>
                  {securityByRegion.map((row, index) => (
                    <tr key={row.region} className={index < securityByRegion.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}>
                      <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">
                        {REGION_LABELS[row.region] ?? row.region}
                      </td>
                      {SECURITY_HEADERS_LABELS.map(({ key, label }) => {
                        const value = row.security_headers?.[key] ?? null
                        const present = value != null && String(value).trim().length > 0
                        return (
                          <td key={`${row.region}-${label}`} className="px-4 py-3 text-xs">
                            {present ? (
                              <span className="font-mono text-zinc-600 dark:text-zinc-300 inline-block max-w-[280px] truncate" title={String(value)}>
                                {String(value)}
                              </span>
                            ) : (
                              <span className="text-zinc-400">missing</span>
                            )}
                          </td>
                        )
                      })}
                      <td className={`px-4 py-3 text-right text-xs font-semibold tabular-nums ${row.security_headers ? scoreColor(row.security_headers.score) : 'text-zinc-400'}`}>
                        {row.security_headers ? `${row.security_headers.score}/5` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">{formatDate(row.sampled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Server-Timing breakdown by region
            </h3>
            {securityRowsWithTiming.length === 0 ? (
              <p className="text-sm text-zinc-400">No Server-Timing breakdown data yet.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {securityRowsWithTiming.map(row => {
                  const entries = timingBreakdownEntries(row.server_timing_breakdown)
                  return (
                    <div key={row.region} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{REGION_LABELS[row.region] ?? row.region}</p>
                        <p className="text-[11px] text-zinc-400">{formatDate(row.sampled_at)}</p>
                      </div>
                      <div className="space-y-1.5">
                        {entries.map(([metric, value]) => (
                          <div key={metric} className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span className="font-mono text-zinc-500">{metric}</span>
                            <span className={`font-semibold ${ttfbColor(value)}`}>{value.toFixed(1)}ms</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'alerts' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Alerts</h2>
            <div className="flex flex-wrap gap-1">
              <Link
                href={buildMonitorHref('alerts', range, null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filteredAlertType == null
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                All
              </Link>
              {VALID_ALERT_TYPES.map(type => (
                <Link
                  key={type}
                  href={buildMonitorHref('alerts', range, type)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filteredAlertType === type
                      ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {ALERT_TYPE_LABELS[type]}
                </Link>
              ))}
            </div>
          </div>

          {alerts.length === 0 ? (
            <p className="text-sm text-zinc-400">No alerts found for the current filter.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Region</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Type</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Metric</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Baseline</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Actual</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Deviation</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert, index) => (
                    <tr key={alert.id} className={index < alerts.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}>
                      <td className="px-4 py-3 text-xs text-zinc-400">{formatDate(alert.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">{REGION_LABELS[alert.region] ?? alert.region}</td>
                      <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 capitalize">{ALERT_TYPE_LABELS[alert.alert_type as AlertType] ?? alert.alert_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-xs font-mono text-zinc-500">{alert.metric}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-500">{formatMs(alert.baseline_ms)}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-500">{formatMs(alert.actual_ms)}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                        {alert.deviation_factor != null ? `${alert.deviation_factor.toFixed(1)}x` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
        </div>
      </div>
    </div>
  )
}

function cacheStatusLabel(status: string | null): { text: string; tone: string; title: string } {
  const normalized = status?.toUpperCase().trim() ?? ''

  if (normalized.includes('HIT')) {
    return {
      text: 'HIT',
      tone: 'text-emerald-600 dark:text-emerald-400',
      title: 'Cache hit was the most common outcome in this region.',
    }
  }

  if (normalized.includes('MISS')) {
    return {
      text: 'MISS',
      tone: 'text-amber-600 dark:text-amber-400',
      title: 'Cache miss was the most common outcome in this region.',
    }
  }

  if (normalized === 'DYNAMIC' || normalized === 'BYPASS') {
    return {
      text: 'DYNAMIC',
      tone: 'text-zinc-500 dark:text-zinc-400',
      title: 'Response is treated as dynamic (not served from cache).',
    }
  }

  if (normalized.length > 0) {
    return {
      text: normalized,
      tone: 'text-zinc-500 dark:text-zinc-400',
      title: 'Most common cache status observed in this region.',
    }
  }

  return {
    text: 'NO SIGNAL',
    tone: 'text-zinc-400',
    title: 'No cache status signal was observed.',
  }
}

