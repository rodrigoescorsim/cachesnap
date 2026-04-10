import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import { TtfbChart, type ChartPoint } from './ttfb-chart'
import { MonitorActions } from './monitor-actions'
import { RealTimeHub } from '../../real-time-hub'
import { extractPop, detectCdn, popToCity } from '@/lib/edge-helpers'
import { ProbeWaterfall, type WaterfallProbe } from './probe-waterfall'
import { VisualGlow } from '../../visual-glow'

interface RegionStat {
  region: string
  probe_count: number
  ttfb_avg_ms: number | null
  bypass_ttfb_avg_ms: number | null
  ttfb_p95_ms: number | null
  ttfb_min_ms: number | null
  ttfb_max_ms: number | null
  total_avg_ms: number | null
  dns_avg_ms: number | null
  tls_avg_ms: number | null
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
  permissions_policy: string | null
  coop: string | null
  coep: string | null
  corp: string | null
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
  served_by: string | null
  sampled_at: Date
}

const REGION_LABELS: Record<string, string> = {
  'sa-east': 'South America',
  'eu-west': 'Europe',
  'us-east': 'US East',
  'us-west': 'US West',
  'ap-east': 'Asia Pacific',
  'ap-south': 'India',
  'oc': 'Oceania',
  'af-south': 'Africa',
}

const VALID_TABS = ['performance', 'bypass', 'security', 'alerts'] as const
type MonitorTab = (typeof VALID_TABS)[number]

const TAB_LABELS: Record<MonitorTab, string> = {
  performance: 'Performance',
  bypass: 'Bypass',
  security: 'Security',
  alerts: 'Alerts',
}

const TAB_GROUPS: Array<{ label: string; tabs: MonitorTab[] }> = [
  { label: 'Observe', tabs: ['performance', 'bypass', 'security'] },
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

const SECURITY_HEADERS_LABELS: { key: keyof SecurityHeaders; label: string; description: string }[] = [
  { key: 'hsts', label: 'HSTS', description: 'Forces browsers to use HTTPS only, preventing SSL stripping attacks.' },
  { key: 'csp', label: 'CSP', description: 'Restricts sources from which content can be loaded, mitigating XSS.' },
  { key: 'x_frame_options', label: 'X-Frame', description: 'Protects visitors against clickjacking by restricting framing.' },
  { key: 'x_content_type', label: 'X-Content', description: 'Prevents the browser from MIME-sniffing the response.' },
  { key: 'referrer_policy', label: 'Referrer', description: 'Controls how much referrer information is sent with requests.' },
  { key: 'permissions_policy', label: 'Permissions', description: 'Restricts use of browser features like camera, mic, or geoloc.' },
  { key: 'coop', label: 'COOP', description: 'Isolates your page from other documents to prevent leak attacks.' },
  { key: 'coep', label: 'COEP', description: 'Prevents loading cross-origin resources without permission.' },
  { key: 'corp', label: 'CORP', description: 'Defines which origins can read the resources of your site.' },
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
      text: hitPct != null ? `${formatPct(hitPct)}%` : 'HIT',
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
      text: 'Hidden',
      tone: 'text-zinc-400/60',
      title: 'No cache headers were observed',
    }
  }

  if (hitPct != null) {
    return {
      text: `${formatPct(hitPct)}%`,
      tone: hitPct > 70 ? 'text-emerald-500' : hitPct >= 30 ? 'text-amber-500' : 'text-red-500',
      title: 'Calculated from observed probe responses',
    }
  }

  return {
    text: 'Hidden',
    tone: 'text-zinc-400/60',
    title: 'No cache headers were observed',
  }
}

function serverTimingDisplay(ms: number | null): { text: string; tone: string; title: string } {
  if (ms == null) {
    return {
      text: 'Hidden',
      tone: 'text-zinc-400/60',
      title: 'The site did not expose Server-Timing or X-Timer headers',
    }
  }

  if (ms === 0) {
    return {
      text: 'Hidden',
      tone: 'text-zinc-400/60',
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

function formatPct(val: number | string | null, decimals: number = 1): string {
  if (val == null) return '—'
  const num = Number(val)
  if (isNaN(num)) return '—'
  if (num % 1 === 0) return Math.round(num).toString()
  return num.toFixed(decimals)
}

function scoreColor(score: number): string {
  if (score >= 7) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 4) return 'text-amber-600 dark:text-amber-400'
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

import { BypassAudit } from './bypass-audit'

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
      ROUND(AVG(ttfb_ms)::numeric, 0)::int            AS ttfb_avg_ms,
      ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)::numeric, 0
      )::int                                          AS ttfb_p95_ms,
      ROUND(MIN(ttfb_ms)::numeric, 0)::int            AS ttfb_min_ms,
      ROUND(MAX(ttfb_ms)::numeric, 0)::int            AS ttfb_max_ms,
      ROUND(AVG(total_ms)::numeric, 0)::int           AS total_avg_ms,
      ROUND(AVG(bypass_ttfb_ms)::numeric, 0)::int     AS bypass_ttfb_avg_ms,
      ROUND(AVG(dns_ms)::numeric, 0)::int             AS dns_avg_ms,
      ROUND(AVG(tls_ms)::numeric, 0)::int             AS tls_avg_ms,
      ROUND(AVG(edge_ms)::numeric, 0)::int            AS edge_avg_ms,
      ROUND(AVG(origin_ms)::numeric, 0)::int          AS origin_avg_ms,
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
               / NULLIF(COUNT(*), 0), 1
      )                                          AS uptime_pct,
      MAX(age_s)::int                            AS max_age_s,
      MAX(time)                                  AS last_probe_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - INTERVAL '24 hours'
    GROUP BY region ORDER BY region
  `

  const latestProbes = await sql<RegionStat[]>`
    SELECT DISTINCT ON (region)
      region,
      ttfb_ms AS ttfb_avg_ms,
      total_ms AS total_avg_ms,
      (SELECT bypass_ttfb_ms FROM probe_results p2 
       WHERE p2.monitor_id = p1.monitor_id AND p2.region = p1.region AND p2.bypass_ttfb_ms IS NOT NULL 
       ORDER BY time DESC LIMIT 1) AS bypass_ttfb_avg_ms,
      dns_ms AS dns_avg_ms,
      tls_ms AS tls_avg_ms,
      edge_ms AS edge_avg_ms,
      origin_ms AS origin_avg_ms,
      redirect_count AS redirect_avg,
      served_by AS common_served_by,
      http_version AS common_http_version,
      cache_status AS common_cache_status,
      status_code AS probe_count,
      COALESCE(error, '') as error,
      age_s AS max_age_s,
      time AS last_probe_at
    FROM probe_results p1
    WHERE monitor_id = ${id}
    ORDER BY region, time DESC
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

  const [secRow] = await sql<{ security_headers: SecurityHeaders | null }[]>`
    SELECT security_headers
    FROM probe_results
    WHERE monitor_id = ${id}
      AND security_headers IS NOT NULL
    ORDER BY time DESC
    LIMIT 1
  `
  const security: SecurityHeaders | null = secRow?.security_headers ?? null

  const chartRaw = range === '7d'
    ? await sql<{ bucket: Date; region: string; ttfb_avg: number; dns_avg: number | null; tls_avg: number | null; cache_hit_pct: number | null }[]>`
        SELECT
          time_bucket('6 hours', time) AS bucket,
          region,
          ROUND(AVG(ttfb_ms)::numeric, 0)                                          AS ttfb_avg,
          ROUND(AVG(dns_ms)::numeric, 0)                                           AS dns_avg,
          ROUND(AVG(tls_ms)::numeric, 0)                                           AS tls_avg,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE cache_status ILIKE '%HIT%')
                   / NULLIF(COUNT(*), 0), 0
          )                                                                         AS cache_hit_pct
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - INTERVAL '7 days'
          AND ttfb_ms IS NOT NULL
        GROUP BY bucket, region
        ORDER BY bucket ASC, region ASC
      `
    : await sql<{ bucket: Date; region: string; ttfb_avg: number; dns_avg: number | null; tls_avg: number | null; cache_hit_pct: number | null }[]>`
        SELECT
          time_bucket('30 minutes', time) AS bucket,
          region,
          ROUND(AVG(ttfb_ms)::numeric, 0)                                          AS ttfb_avg,
          ROUND(AVG(dns_ms)::numeric, 0)                                           AS dns_avg,
          ROUND(AVG(tls_ms)::numeric, 0)                                           AS tls_avg,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE cache_status ILIKE '%HIT%')
                   / NULLIF(COUNT(*), 0), 0
          )                                                                         AS cache_hit_pct
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - INTERVAL '24 hours'
          AND ttfb_ms IS NOT NULL
        GROUP BY bucket, region
        ORDER BY bucket ASC, region ASC
      `

  const hourlyBypass = await sql<{ hour: Date; region: string; edge_ttfb: number; origin_ttfb: number; savings: number }[]>`
    WITH regular_probes AS (
      SELECT
        date_trunc('hour', time) AS hour,
        region,
        AVG(ttfb_ms) AS ttfb_avg
      FROM probe_results
      WHERE monitor_id = ${id}
        AND bypass_ttfb_ms IS NULL
        AND time > NOW() - INTERVAL '24 hours'
        AND ttfb_ms IS NOT NULL
        AND cache_status ILIKE '%HIT%'
      GROUP BY 1, 2
    ),
    bypass_probes AS (
      SELECT
        date_trunc('hour', time) AS hour,
        region,
        AVG(bypass_ttfb_ms) AS bypass_avg
      FROM probe_results
      WHERE monitor_id = ${id}
        AND bypass_ttfb_ms IS NOT NULL
        AND time > NOW() - INTERVAL '24 hours'
      GROUP BY 1, 2
    )
    SELECT
      r.hour,
      r.region,
      ROUND(r.ttfb_avg::numeric, 1)::float AS edge_ttfb,
      ROUND(b.bypass_avg::numeric, 1)::float AS origin_ttfb,
      ROUND((b.bypass_avg - r.ttfb_avg)::numeric, 1)::float AS savings
    FROM regular_probes r
    JOIN bypass_probes b ON r.hour = b.hour AND r.region = b.region
    ORDER BY r.hour DESC, r.region ASC
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
      served_by,
      time AS sampled_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - INTERVAL '24 hours'
      AND (security_headers IS NOT NULL OR server_timing_breakdown IS NOT NULL)
    ORDER BY region, time DESC
  `

  const waterfallProbes = await sql<WaterfallProbe[]>`
    SELECT DISTINCT ON (region)
      region,
      ROUND(dns_ms::numeric, 1) AS dns_ms,
      ROUND(tls_ms::numeric, 1) AS tls_ms,
      ttfb_ms,
      download_ms,
      total_ms,
      edge_ms,
      origin_ms,
      redirect_count,
      cache_status,
      served_by,
      age_s,
      server_timing_breakdown,
      time AS probed_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND error IS NULL
    ORDER BY region, time DESC
  `

  const monitorHostname = safeHostname(monitor.url)

  const cacheStatsByRegion = new Map(stats.map(row => [row.region, row]))
  const cacheRegions = [...new Set(stats.map(row => row.region))].sort()
  const hasBypassComparison = stats.some(row => row.bypass_ttfb_avg_ms != null)

  const chartPoints: ChartPoint[] = chartRaw.map(row => ({
    bucket: row.bucket.toISOString(),
    region: row.region,
    ttfb_avg: Number(row.ttfb_avg),
    dns_avg: row.dns_avg != null ? Number(row.dns_avg) : null,
    tls_avg: row.tls_avg != null ? Number(row.tls_avg) : null,
    cache_hit_pct: row.cache_hit_pct != null ? Number(row.cache_hit_pct) : null,
  }))

  const monitorDisplayName = monitor.name ?? monitorHostname ?? monitor.url
  const securityRowsWithTiming = securityByRegion.filter(row => timingBreakdownEntries(row.server_timing_breakdown).length > 0)
  const totalProbes = stats.reduce((sum, s) => sum + s.probe_count, 0)
  const isCollecting = totalProbes < 3

  return (
    <div className="space-y-6">
      <RealTimeHub userId={user.id} watchId={monitor.id} />
      <AutoRefresh />
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/30 px-4 py-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-tight font-bold tracking-[-0.03em] text-zinc-900 dark:text-zinc-50">
              {monitorDisplayName}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5 truncate tracking-tight">{monitor.url}</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2">
              {alerts.length > 0 && (
                 <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-2.5 py-1 text-xs font-bold text-red-700 dark:text-red-400 animate-pulse">
                   {alerts.length} Incident{alerts.length > 1 ? 's' : ''}
                 </span>
              )}
              {security && (
                <div className="flex items-center gap-1.5 px-3 py-0.5 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Security</span>
                  <span className={`text-xs font-bold ${security.score >= 7 ? 'text-emerald-500' : security.score >= 4 ? 'text-amber-500' : 'text-red-500'}`}>
                    {security.score}/9
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-3 py-0.5 h-7 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Live Sync</span>
              </div>
              <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-zinc-200 dark:border-zinc-800 h-6">
                 <div className={`h-2 w-2 rounded-full ${monitor.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                 <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">{monitor.is_active ? 'Active' : 'Paused'}</span>
              </div>
            </div>
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

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <nav aria-label="Monitor sections" className="space-y-6 px-1">
            <div className="space-y-5">
              {TAB_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">
                    {group.label}
                  </p>
                  <ul className="space-y-1">
                    {group.tabs.map(tab => (
                      <li key={tab}>
                        <Link
                          href={buildMonitorHref(tab, range, tab === 'alerts' ? filteredAlertType : null)}
                          className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-sm font-medium transition-all ${
                            activeTab === tab
                              ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-950 shadow-md shadow-zinc-200/50 dark:shadow-none'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                activeTab === tab
                                  ? 'bg-emerald-400 animate-pulse'
                                  : 'bg-zinc-300 dark:bg-zinc-700'
                              }`}
                            />
                            <span>{TAB_LABELS[tab]}</span>
                          </span>
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
      {activeTab === 'performance' && (
      <div className="space-y-10">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live Activity — Regional Latest
            </h2>
          </div>
          {latestProbes.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">Listening for incoming probes...</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-950/20 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Region</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">PoP</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="DNS Lookup Time">DNS</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="TLS Handshake Time">TLS</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">TTFB</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Cache</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Status</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {latestProbes.map((s, i) => {
                    const isError = (s as any).error && (s as any).error !== ''
                    const cache = cacheDisplay(s.common_cache_status, null)
                    return (
                      <tr key={s.region} className={i < latestProbes.length - 1 ? 'border-b border-zinc-100/50 dark:border-zinc-800/50' : ''}>
                        <td className="px-3 py-2.5 font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                          {REGION_LABELS[s.region] ?? s.region}
                        </td>
                        <td className="px-3 py-2.5">
                           <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 dark:text-zinc-400 ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/50" title={extractPop(s.common_served_by) ?? 'Unknown'}>
                             {popToCity(extractPop(s.common_served_by)) ?? 'UNK'}
                           </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-mono text-purple-600 dark:text-purple-400 tabular-nums">
                          <VisualGlow value={s.dns_avg_ms}>{s.dns_avg_ms != null ? `${s.dns_avg_ms}ms` : '—'}</VisualGlow>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-mono text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">
                          <VisualGlow value={s.tls_avg_ms}>{s.tls_avg_ms != null ? `${s.tls_avg_ms}ms` : '—'}</VisualGlow>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${ttfbColor(s.ttfb_avg_ms)}`}>
                          <VisualGlow value={s.ttfb_avg_ms}>{s.ttfb_avg_ms != null ? `${s.ttfb_avg_ms}ms` : '—'}</VisualGlow>
                        </td>
                        <td className={`px-3 py-2.5 text-right text-xs font-medium uppercase ${cache.tone}`}>
                           {cache.text}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                        {(() => {
                          const status = s.probe_count
                          const color = status < 300 ? 'bg-emerald-100/80 text-emerald-700' : status < 400 ? 'bg-blue-100/80 text-blue-700' : 'bg-red-100/80 text-red-700'
                          const hops = Number(s.redirect_avg ?? 0)
                          return (
                            <div className="flex items-center justify-end gap-1.5">
                              {hops > 0 && (
                                <span className="inline-flex items-center rounded-md bg-purple-100 px-1 py-0.5 text-[9px] font-bold text-purple-600" title={`${hops} redirect hops`}>
                                  {hops}H
                                </span>
                              )}
                              {isError ? (
                                <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase" title={(s as any).error}>ERR</span>
                              ) : (
                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${color}`}>
                                  {status || 'OK'}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                        <td className="px-3 py-2.5 text-right text-[10px] text-zinc-400 tabular-nums whitespace-nowrap">
                          {s.last_probe_at ? new Date(s.last_probe_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
            Daily Insights — 24h Statistical Averages
          </h2>
          {stats.length === 0 ? (
            <p className="text-sm text-zinc-400">Compiling historical insights...</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Region</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Average DNS Lookup">DNS</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Average TLS Handshake">TLS</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">TTFB</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">P95</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight whitespace-nowrap">Min / Max</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Cache</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Uptime</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => {
                    return (
                      <tr
                        key={s.region}
                        className={i < stats.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}
                      >
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {REGION_LABELS[s.region] ?? s.region}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-mono text-purple-600 dark:text-purple-400 tabular-nums">
                          {s.dns_avg_ms != null ? `${s.dns_avg_ms}ms` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-mono text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">
                          {s.tls_avg_ms != null ? `${s.tls_avg_ms}ms` : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${ttfbColor(s.ttfb_avg_ms)}`}>
                          {s.ttfb_avg_ms != null ? `${s.ttfb_avg_ms}ms` : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${ttfbColor(s.ttfb_p95_ms)}`}>
                          {s.ttfb_p95_ms != null ? `${s.ttfb_p95_ms}ms` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[11px] text-zinc-400 tabular-nums whitespace-nowrap">
                          {s.ttfb_min_ms != null ? `${s.ttfb_min_ms}ms / ${s.ttfb_max_ms}ms` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {(() => {
                            const cache = cacheDisplay(s.common_cache_status, s.cache_hit_pct)
                            return (
                              <div className="flex flex-col items-end">
                                <span className={`text-[10px] font-bold uppercase ${cache.tone}`} title={cache.title}>
                                  {cache.text}
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${uptimeColor(s.uptime_pct)}`}>
                          {s.uptime_pct != null ? `${formatPct(s.uptime_pct)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {s.common_http_version ? (
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shadow-sm ring-1 ring-inset ${
                              s.common_http_version === 'HTTP/1.1'
                                ? 'bg-amber-100/50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-800/50'
                                : s.common_http_version === 'HTTP/3'
                                ? 'bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-800/50'
                                : 'bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-400 ring-zinc-200/50 dark:ring-zinc-700/50'
                            }`}>
                              {s.common_http_version === 'HTTP/1.1' ? '1.1' : s.common_http_version === 'HTTP/3' ? 'H3' : 'H2'}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-right text-xs ${s.error_count > 0 ? 'text-red-500 font-bold' : 'text-zinc-400/60'}`}>
                          {s.error_count}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {waterfallProbes.length > 0 && (
          <ProbeWaterfall probes={waterfallProbes} />
        )}

        {stats.length > 0 && (
          <section>
            <TtfbChart data={chartPoints} range={range} />
          </section>
        )}

        {spikes.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
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
            <p className="mt-1.5 text-xs text-zinc-400 italic">Detected when TTFB increased by more than 50% between consecutive 30-minute windows.</p>
          </section>
        )}

        {weekTrend.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
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
            <p className="mt-1.5 text-xs text-zinc-400 italic">Comparing last 7 days vs the prior 7 days.</p>
          </section>
        )}
      </div>
      )}

      {activeTab === 'bypass' && (
        <BypassAudit data={hourlyBypass} regionLabels={REGION_LABELS} />
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
                  {security.score}<span className="text-base font-normal text-zinc-400">/9</span>
                </span>
                <span className="text-sm text-zinc-500">Latest observed security headers score.</span>
              </div>
            </div>
          )}

          {(() => {
            if (securityByRegion.length === 0) return null

            // Agrupa regiões por "assinatura" de headers
            const profiles = new Map<string, { headers: SecurityHeaders | null; regions: string[]; sampled_at: Date }>()
            
            securityByRegion.forEach(row => {
              const sig = JSON.stringify(row.security_headers || {})
              if (!profiles.has(sig)) {
                profiles.set(sig, { headers: row.security_headers, regions: [], sampled_at: row.sampled_at })
              }
              profiles.get(sig)!.regions.push(row.region)
            })

            const sortedProfiles = [...profiles.values()].sort((a, b) => b.regions.length - a.regions.length)
            const mainProfile = sortedProfiles[0]
            const secondaryProfiles = sortedProfiles.slice(1)

            return (
              <div className="space-y-8">
                {/* Perfil Global / Principal */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Global Security Profile</h3>
                    <div className="flex -space-x-2">
                       {mainProfile.regions.map(r => (
                         <div key={r} title={REGION_LABELS[r]} className="w-6 h-6 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950 flex items-center justify-center text-[8px] text-white font-bold cursor-help shadow-sm">
                           {r.split('-').map(p => p[0].toUpperCase()).join('')}
                         </div>
                       ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border-2 border-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-500/5 p-6 shadow-sm ring-1 ring-emerald-500/10 transition-all hover:ring-emerald-500/30">
                     <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {SECURITY_HEADERS_LABELS.map(({ key, label, description }) => {
                          const value = mainProfile.headers?.[key] ?? null
                          const present = value != null && String(value).trim().length > 0
                          return (
                            <div key={key} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight">{label}</span>
                                {present ? (
                                  <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-200/50 dark:ring-emerald-800/50 uppercase">Active</span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tight">Missing</span>
                                )}
                              </div>
                              {present && (
                                <div className="rounded border border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 p-2">
                                  <code className="block text-[10px] text-zinc-600 dark:text-zinc-400 break-all font-mono leading-relaxed">
                                    {String(value)}
                                  </code>
                                </div>
                              )}
                              <p className="text-[10px] text-zinc-400 italic">
                                {description}
                              </p>
                            </div>
                          )
                        })}
                     </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 text-right italic">Consistent across {mainProfile.regions.length} regions. Last verified: {formatDate(mainProfile.sampled_at)}</p>
                </section>

                {/* Drifts (Se houver) */}
                {secondaryProfiles.length > 0 && (
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                      Security Drift Detected
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {secondaryProfiles.map((prof, idx) => (
                        <div key={idx} className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/20 p-4 shadow-sm space-y-3">
                           <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-red-700 dark:text-red-400">Variant configuration</p>
                              <div className="flex gap-1">
                                {prof.regions.map(r => (
                                  <span key={r} className="text-[10px] font-bold bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 text-red-600">
                                    {REGION_LABELS[r]}
                                  </span>
                                ))}
                              </div>
                           </div>
                           <div className="space-y-2">
                              {SECURITY_HEADERS_LABELS.map(h => {
                                const mainVal = mainProfile.headers?.[h.key]
                                const driftVal = prof.headers?.[h.key]
                                if (JSON.stringify(mainVal) === JSON.stringify(driftVal)) return null
                                return (
                                  <div key={h.key} className="text-[10px] p-2 bg-white/50 dark:bg-zinc-950/50 rounded border border-red-50 dark:border-red-900/30">
                                    <p className="font-bold text-zinc-600 dark:text-zinc-400 uppercase mb-1">{h.label}</p>
                                    <div className="grid grid-cols-2 gap-2 italic">
                                      <div><span className="text-zinc-400">Main:</span><br/><span className="text-emerald-600 line-through opacity-50">{String((mainVal || 'Missing'))}</span></div>
                                      <div><span className="text-red-600 font-bold">Drift:</span><br/><span className="text-red-700 dark:text-red-400">{String((driftVal || 'Missing'))}</span></div>
                                    </div>
                                  </div>
                                )
                              })}
                           </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )
          })()}

          <div>
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Server-Timing breakdown by region
            </h3>
            {securityRowsWithTiming.length === 0 ? (
              <p className="text-sm text-zinc-400">No Server-Timing breakdown data yet.</p>
            ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {securityRowsWithTiming.map(row => {
                  const entries = timingBreakdownEntries(row.server_timing_breakdown)
                  return (
                    <div key={row.region} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm group hover:border-emerald-500/30 transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-zinc-50 dark:border-zinc-800">
                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-tight">{REGION_LABELS[row.region] ?? row.region}</p>
                        <p className="text-[10px] text-zinc-400 font-mono tracking-tighter">{extractPop(row.served_by) ?? 'UNK'}</p>
                      </div>
                      <div className="space-y-2">
                        {entries.map(([metric, value]) => (
                          <div key={metric} className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                            <span className="font-mono text-zinc-500 dark:text-zinc-400">{metric}</span>
                            <span className={`font-bold ${ttfbColor(value)} bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 rounded ring-1 ring-zinc-100 dark:ring-zinc-800`}>{value.toFixed(0)}ms</span>
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

