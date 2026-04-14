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
import { TIMING } from './timing-metrics-palette'
import { VisualGlow } from '../../visual-glow'
import { Activity, ShieldCheck, Lock, AlertCircle, History, AlertTriangle, TrendingUp, Zap } from 'lucide-react'

interface RegionStat {
  region: string
  probe_count: number
  ttfb_avg_ms: number | null
  edge_hit_avg_ms: number | null
  origin_miss_avg_ms: number | null
  bypass_ttfb_avg_ms: number | null
  ttfb_p95_ms: number | null
  ttfb_min_ms: number | null
  ttfb_max_ms: number | null
  download_avg_ms: number | null
  total_avg_ms: number | null
  dns_avg_ms: number | null
  tcp_avg_ms: number | null
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

/** One row per region: latest probe only (real-time table). */
interface LatestProbeRow {
  region: string
  ttfb_ms: number | null
  download_ms: number | null
  total_ms: number | null
  dns_ms: number | null
  tcp_ms: number | null
  tls_ms: number | null
  edge_ms: number | null
  origin_ms: number | null
  redirect_count: number | null
  common_served_by: string | null
  common_http_version: string | null
  common_cache_status: string | null
  status_code: number | null
  error: string
  max_age_s: number | null
  last_probe_at: Date | null
  probe_version: string | null
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
  ssl?: {
    valid_to?: string
    valid_from?: string
    days_remaining?: number
    issuer?: string
    protocol?: string
  }
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

const REGION_DESCRIPTIONS: Record<string, string> = {
  'sa-east': 'South America — AWS sa-east-1 (São Paulo, BR)',
  'us-east': 'US East — AWS us-east-2 (Ohio, US)',
  'us-west': 'US West — AWS us-west-2 (Oregon, US)',
  'eu-west': 'Europe — AWS eu-central-1 (Frankfurt, DE)',
  'ap-south': 'India — AWS ap-south-1 (Mumbai, IN)',
  'ap-east': 'Asia Pacific — AWS ap-northeast-1 (Tokyo, JP)',
  'oc': 'Oceania — AWS ap-southeast-2 (Sydney, AU)',
  'af-south': 'Africa — AWS af-south-1 (Cape Town, ZA)',
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

const VALID_TABS = ['performance', 'resilience', 'security', 'incidents'] as const
type MonitorTab = (typeof VALID_TABS)[number]

const TAB_LABELS: Record<MonitorTab, string> = {
  performance: 'Performance',
  resilience: 'Resilience',
  security: 'Security',
  incidents: 'Incidents',
}

const TAB_ICONS: Record<MonitorTab, any> = {
  performance: Activity,
  resilience: ShieldCheck,
  security: Lock,
  incidents: AlertCircle,
}

const TAB_GROUPS: Array<{ label: string; tabs: MonitorTab[] }> = [
  { label: 'Measure', tabs: ['performance', 'resilience'] },
  { label: 'Protect', tabs: ['security'] },
  { label: 'Respond', tabs: ['incidents'] },
]

const VALID_PERFORMANCE_VIEWS = ['real-time', 'trends', 'diagnostics', 'infrastructure'] as const
type PerformanceView = (typeof VALID_PERFORMANCE_VIEWS)[number]

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Real-time',
  trends: 'Trends',
  diagnostics: 'Diagnostics',
  infrastructure: 'Infrastructure',
}

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
  if (ms <= 150) return 'text-emerald-500' // Excellent (Green)
  if (ms <= 300) return 'text-green-500'   // Good (Lime)
  if (ms <= 600) return 'text-amber-500'   // Acceptable (Amber)
  return 'text-red-500'                   // High Latency (Red)
}



/** Edge TTFB should be very fast (Cache HITs). */
function edgeTtfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= 100) return 'text-emerald-500'
  if (ms <= 200) return 'text-green-500'
  if (ms <= 300) return 'text-amber-500'
  return 'text-red-500'
}

/** Origin TTFB accounts for backend processing and network distance. */
function originTtfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= 300) return 'text-emerald-500'
  if (ms <= 600) return 'text-green-500'
  if (ms <= 900) return 'text-amber-500'
  return 'text-red-500'
}

function uptimeColor(pct: number | null, errorCount: number = 0): string {
  if (pct == null) return 'text-zinc-400'
  if (errorCount > 5) return 'text-red-500 font-bold'
  if (errorCount > 0) return 'text-amber-500 font-semibold'
  if (pct >= 99.9) return 'text-emerald-500'
  if (pct >= 99.0) return 'text-green-500'
  return 'text-amber-500'
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
      text: hitPct != null ? `${formatPct(hitPct)}%` : 'MISS',
      tone: 'text-amber-500',
      title: 'Cache miss observed',
    }
  }

  if (normalizedStatus === 'DYNAMIC' || normalizedStatus === 'BYPASS' || normalizedStatus === 'HIDDEN') {
    return {
      text: normalizedStatus === 'HIDDEN' ? 'Hidden' : normalizedStatus === 'DYNAMIC' ? 'Dynamic' : 'Bypass',
      tone: 'text-zinc-500 dark:text-zinc-400',
      title: 'No cacheable response signal',
    }
  }

  // Fallback for 0% hit rate with no clear status
  if (hitPct === 0 || normalizedStatus === null) {
    return {
      text: 'Hidden',
      tone: 'text-zinc-400/60',
      title: 'No cache headers were observed',
    }
  }

  return {
    text: hitPct != null ? `${formatPct(hitPct)}%` : '—',
    tone: hitPct != null && hitPct > 70 ? 'text-emerald-500' : 'text-amber-500',
    title: 'Observed from response headers',
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

/** Compact Age header display for cache badge (e.g. 45s, 12m, 4h, 2d). */
function formatCacheAgeShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

/** `Age` header semantics: seconds in shared cache. Tiers for emphasis (zombie_cache alert: age_s > 86_400). */
const AGE_RECENT_MAX_S = 3600 // ≤1h — still “fresh” at the edge
const AGE_ZOMBIE_THRESHOLD_S = 86_400 // same boundary as probe-waterfall zombie detection (strictly older = red)

function ageBadgeVisual(ageSeconds: number): { className: string; tierHint: string } {
  if (ageSeconds <= AGE_RECENT_MAX_S) {
    return {
      className: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      tierHint: 'Recently cached (≤1h)',
    }
  }
  if (ageSeconds <= AGE_ZOMBIE_THRESHOLD_S) {
    return {
      className: 'bg-amber-100/80 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
      tierHint: 'Elevated cache age (>1h, up to 24h)',
    }
  }
  return {
    className: 'bg-red-100/80 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    tierHint: 'Long-lived in cache (>24h) — review invalidation / TTL',
  }
}

function edgeOriginTooltip(edge: number | null, origin: number | null): string {
  const parts: string[] = []
  if (edge != null) parts.push(`Edge: ${Math.round(edge)}ms`)
  if (origin != null) parts.push(`Origin: ${Math.round(origin)}ms`)
  return parts.length
    ? `${parts.join(' · ')} (from Server-Timing / edge headers)`
    : ''
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

function normalizeView(value: string | undefined): PerformanceView {
  return VALID_PERFORMANCE_VIEWS.includes((value ?? '') as PerformanceView) ? (value as PerformanceView) : 'real-time'
}

function buildMonitorHref(tab: MonitorTab, range: string, alertType: AlertType | null = null): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (range === '7d') params.set('range', '7d')
  if (tab === 'incidents' && alertType) params.set('alert_type', alertType)
  const query = params.toString()
  return query ? `?${query}` : '?'
}

function buildViewHref(view: PerformanceView, range: string): string {
  const params = new URLSearchParams()
  params.set('tab', 'performance')
  params.set('view', view)
  if (range === '7d') params.set('range', '7d')
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
  searchParams: Promise<{ range?: string | string[]; tab?: string | string[]; view?: string | string[]; alert_type?: string | string[] }>
}) {
  const user = await getSession()
  if (!user) return null

  const { id } = await params
  const rawSearchParams = await searchParams
  const rangeValue = readFirst(rawSearchParams.range)
  const tabValue = readFirst(rawSearchParams.tab)
  const viewValue = readFirst(rawSearchParams.view)
  const alertTypeValue = readFirst(rawSearchParams.alert_type)

  const range = rangeValue === '7d' ? '7d' : '24h'
  const activeTab = normalizeTab(tabValue)
  const filteredAlertType = normalizeAlertType(alertTypeValue)
  const activeView: PerformanceView = activeTab === 'performance' ? normalizeView(viewValue) : 'real-time'

  const [monitor] = await sql<{
    id: string; url: string; name: string | null; is_active: boolean; check_interval_seconds: number; audit_interval_seconds: number;
    notify_email: string | null; notify_email_enabled: boolean;
    notify_slack_webhook: string | null; notify_slack_enabled: boolean;
  }[]>`
    SELECT id, url, name, is_active, check_interval_seconds, audit_interval_seconds,
           notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled
    FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) notFound()

  const stats = await sql<RegionStat[]>`
    SELECT
      region,
      COUNT(*)::int                              AS probe_count,
      ROUND(AVG(ttfb_ms)::numeric, 0)::int            AS ttfb_avg_ms,
      ROUND(AVG(ttfb_ms) FILTER (WHERE cache_status ILIKE '%HIT%' OR cache_status = 'STALE' OR cache_status = 'REVALIDATED')::numeric, 0)::int AS edge_hit_avg_ms,
      ROUND(AVG(ttfb_ms) FILTER (WHERE (cache_status ILIKE '%MISS%' OR cache_status = 'DYNAMIC' OR cache_status = 'BYPASS' OR cache_status = 'EXPIRED') AND cache_status != 'HIDDEN')::numeric, 0)::int AS origin_miss_avg_ms,
      (
        SELECT ROUND(AVG(origin_ttfb_ms)::numeric, 0)::int 
        FROM audit_results a 
        WHERE a.monitor_id = ${id} AND a.region = probe_results.region 
          AND a.time > NOW() - INTERVAL '24 hours'
      )                                               AS bypass_ttfb_avg_ms,
      ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)::numeric, 0
      )::int                                          AS ttfb_p95_ms,
      ROUND(MIN(ttfb_ms)::numeric, 0)::int            AS ttfb_min_ms,
      ROUND(MAX(ttfb_ms)::numeric, 0)::int            AS ttfb_max_ms,
      ROUND(AVG(download_ms)::numeric, 0)::int        AS download_avg_ms,
      ROUND(AVG(total_ms)::numeric, 0)::int           AS total_avg_ms,
      ROUND(AVG(dns_ms)::numeric, 0)::int             AS dns_avg_ms,
      ROUND(AVG(tcp_ms)::numeric, 0)::int              AS tcp_avg_ms,
      ROUND(AVG(tls_ms)::numeric, 0)::int             AS tls_avg_ms,
      ROUND(AVG(edge_ms)::numeric, 0)::int            AS edge_avg_ms,
      ROUND(AVG(origin_ms)::numeric, 0)::int            AS origin_avg_ms,
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

  const latestProbes = await sql<LatestProbeRow[]>`
    SELECT DISTINCT ON (region)
      region,
      ttfb_ms,
      download_ms,
      total_ms,
      dns_ms,
      tcp_ms,
      tls_ms,
      edge_ms,
      origin_ms,
      redirect_count,
      served_by AS common_served_by,
      http_version AS common_http_version,
      cache_status AS common_cache_status,
      status_code,
      age_s AS max_age_s,
      time AS last_probe_at,
      probe_version
    FROM probe_results p1
    WHERE monitor_id = ${id}
    ORDER BY region, time DESC
  `

  const incidentTrends = await sql<{ bucket: Date; count: number }[]>`
    SELECT time_bucket('1h', created_at) AS bucket, COUNT(*)::int
    FROM alerts
    WHERE monitor_id = ${id} AND created_at > NOW() - INTERVAL '24 HOURS'
    GROUP BY bucket ORDER BY bucket ASC
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
    ? await sql<{ bucket: Date; region: string; ttfb_avg: number; dns_avg: number | null; tcp_avg: number | null; tls_avg: number | null; cache_hit_pct: number | null }[]>`
        SELECT
          time_bucket('6 hours', time) AS bucket,
          region,
          ROUND(AVG(ttfb_ms)::numeric, 0)                                          AS ttfb_avg,
          ROUND(AVG(dns_ms)::numeric, 0)                                           AS dns_avg,
          ROUND(AVG(tcp_ms)::numeric, 0)                                           AS tcp_avg,
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
    : await sql<{ bucket: Date; region: string; ttfb_avg: number; dns_avg: number | null; tcp_avg: number | null; tls_avg: number | null; cache_hit_pct: number | null }[]>`
        SELECT
          time_bucket('30 minutes', time) AS bucket,
          region,
          ROUND(AVG(ttfb_ms)::numeric, 0)                                          AS ttfb_avg,
          ROUND(AVG(dns_ms)::numeric, 0)                                           AS dns_avg,
          ROUND(AVG(tcp_ms)::numeric, 0)                                           AS tcp_avg,
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

  const hourlyBypass = (activeView === 'infrastructure' || activeView === 'diagnostics')
    ? await sql<{ hour: Date; region: string; edge_ttfb: number; origin_ttfb: number; savings: number; edge_cache_status: string | null }[]>`
        SELECT
          date_trunc('hour', time) AS hour,
          region,
          AVG(edge_ttfb_ms) AS edge_ttfb,
          AVG(origin_ttfb_ms) AS origin_ttfb,
          AVG(origin_ttfb_ms - edge_ttfb_ms) AS savings,
          MODE() WITHIN GROUP (ORDER BY edge_cache_status) AS edge_cache_status,
          MODE() WITHIN GROUP (ORDER BY origin_cache_status) AS origin_cache_status
        FROM audit_results
        WHERE monitor_id = ${id}
          AND time > NOW() - INTERVAL '24 hours'
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2 ASC
      `
    : []

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
    tcp_avg: row.tcp_avg != null ? Number(row.tcp_avg) : null,
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
      <div className="rounded-xl border border-border bg-surface/50 backdrop-blur px-4 py-2.5 sm:px-4 sm:py-3">
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
                <Link
                  href={buildMonitorHref('incidents', range)}
                  className="flex items-center gap-1.5 px-3 py-0.5 h-7 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                >
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tight">Incidents</span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">
                    {alerts.length}
                  </span>
                </Link>
              )}
              {security && (
                <Link
                  href={buildMonitorHref('security', range)}
                  className="flex items-center gap-1.5 px-3 py-0.5 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tight">Security</span>
                  <span className={`text-xs font-bold ${security.score >= 7 ? 'text-emerald-500' : security.score >= 4 ? 'text-amber-500' : 'text-red-500'}`}>
                    {security.score}/9
                  </span>
                </Link>
              )}
              <Link
                href={buildMonitorHref('performance', range)}
                className="flex items-center gap-1.5 px-3 py-0.5 h-7 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Live Sync</span>
              </Link>
              <div className="flex items-center gap-1.5 pl-3 ml-1 border-l border-zinc-200 dark:border-zinc-800/50 h-6">
                <div className={`h-2 w-2 rounded-full ${monitor.is_active ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`} />
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tight">{monitor.is_active ? 'Active' : 'Paused'}</span>
              </div>
            </div>
            <MonitorActions
              id={monitor.id}
              name={monitor.name}
              checkIntervalSeconds={monitor.check_interval_seconds}
              auditIntervalSeconds={monitor.audit_interval_seconds}
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

      <div className="grid gap-8 lg:grid-cols-[150px_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <nav aria-label="Monitor sections" className="space-y-6">
            <div className="space-y-6">
              {TAB_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.tabs.map(tab => {
                      const Icon = TAB_ICONS[tab]
                      return (
                        <li key={tab}>
                          <Link
                            href={buildMonitorHref(tab, range, tab === 'incidents' ? filteredAlertType : null)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all group ${activeTab === tab
                              ? 'bg-zinc-900 border border-zinc-900 dark:border-zinc-700/50 dark:bg-zinc-800 text-white shadow-sm'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50'
                              }`}
                          >
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 transition-colors ${activeTab === tab
                                ? 'text-emerald-400'
                                : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                                }`}
                            />
                            <span>{TAB_LABELS[tab]}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
          {activeTab === 'performance' && (
            <div>
              <nav
                className="flex items-center border-b border-zinc-200 dark:border-zinc-800 mb-8"
                aria-label="Performance views"
              >
                {VALID_PERFORMANCE_VIEWS.map(v => (
                  <Link
                    key={v}
                    href={buildViewHref(v, range)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${activeView === v
                      ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                      : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                  >
                    {PERFORMANCE_VIEW_LABELS[v]}
                  </Link>
                ))}
              </nav>

              {activeView === 'real-time' && (
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
                      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-white/5 dark:bg-black/20">
                              <th
                                className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Geographic region where this probe ran"
                              >
                                Region
                              </th>
                              <th
                                className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Point of presence / edge node hint (from CF-Ray, X-Served-By, or similar)"
                              >
                                PoP
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="DNS lookup time — resolving the hostname to an IP"
                              >
                                DNS
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="TCP handshake time (after DNS, before TLS on HTTPS)"
                              >
                                TCP
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="TLS handshake time after the TCP connection is established"
                              >
                                TLS
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Time to first byte — until response headers start"
                              >
                                TTFB
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Time to download the response body after the first byte (headers)"
                              >
                                DL
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="End-to-end wall time for the full request (connect, wait, body)"
                              >
                                Total
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Cache status from the response (e.g. HIT, MISS, DYNAMIC, BYPASS)"
                              >
                                Cache
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Age header — seconds this response has been in the shared cache (not browser TTL). Color: fresh ≤1h, amber >1h–24h, red >24h (same idea as zombie cache)"
                              >
                                Age
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="HTTP Protocol version (e.g. H3 = HTTP/3, H2 = HTTP/2, 1.1 = HTTP/1.1)"
                              >
                                HTTP
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="HTTP status code of the final response after redirects; ↷ shows redirect hop count"
                              >
                                Status
                              </th>
                              <th
                                className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                title="Local time when the latest probe for this region completed"
                              >
                                Sync
                              </th>
                              {process.env.NODE_ENV === 'development' && (
                                <th
                                  className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight"
                                  title="Software version of the Lambda probe"
                                >
                                  v
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {latestProbes.map((s, i) => {
                              const isError = s.error && s.error !== ''
                              const cache = cacheDisplay(s.common_cache_status, null)
                              const age = Number(s.max_age_s ?? 0)
                              const ageVisual = age > 0 ? ageBadgeVisual(age) : null
                              const ageBadgeTitle
                                = age > 0 && ageVisual
                                  ? `Age header: ${age}s — ${ageVisual.tierHint}`
                                  : ''
                              const hasEdgeOrigin = s.edge_ms != null || s.origin_ms != null
                              const eoTip = edgeOriginTooltip(s.edge_ms, s.origin_ms)
                              return (
                                <tr key={s.region} className={i < latestProbes.length - 1 ? 'border-b border-zinc-100/50 dark:border-zinc-800/50' : ''}>
                                  <td className="px-3 py-2.5 font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                    <span title={REGION_DESCRIPTIONS[s.region] ?? s.region}>
                                      {REGION_LABELS[s.region] ?? s.region}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="inline-flex items-center rounded-md bg-white/5 dark:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 ring-1 ring-inset ring-white/10" title={extractPop(s.common_served_by) ?? 'Unknown'}>
                                      {popToCity(extractPop(s.common_served_by)) ?? '—'}
                                    </span>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.dns.text}`}>
                                    <VisualGlow value={s.dns_ms}>{s.dns_ms != null ? `${Math.round(s.dns_ms)}ms` : '—'}</VisualGlow>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.tcp.text}`}>
                                    <VisualGlow value={s.tcp_ms}>{s.tcp_ms != null ? `${Math.round(s.tcp_ms)}ms` : '—'}</VisualGlow>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.tls.text}`}>
                                    <VisualGlow value={s.tls_ms}>{s.tls_ms != null ? `${Math.round(s.tls_ms)}ms` : '—'}</VisualGlow>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${ttfbColor(s.ttfb_ms)}`}>
                                    <VisualGlow value={s.ttfb_ms}>{s.ttfb_ms != null ? `${Math.round(s.ttfb_ms)}ms` : '—'}</VisualGlow>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.download.text}`}>
                                    <VisualGlow value={s.download_ms}>{s.download_ms != null ? `${Math.round(s.download_ms)}ms` : '—'}</VisualGlow>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right text-xs font-mono font-semibold tabular-nums ${TIMING.total.text}`}>
                                    <VisualGlow value={s.total_ms}>{s.total_ms != null ? `${Math.round(s.total_ms)}ms` : '—'}</VisualGlow>
                                  </td>
                                  <td className="px-3 py-2.5 text-right" title={cache.title}>
                                    <span className={`${cache.text.includes('%') || cache.text === '—' ? 'text-xs' : 'text-[10px]'} font-medium uppercase ${cache.tone}`}>{cache.text}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {age > 0 && ageVisual ? (
                                      <span
                                        className={`inline-flex items-center justify-end rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums ${ageVisual.className}`}
                                        title={ageBadgeTitle}
                                      >
                                        {formatCacheAgeShort(age)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-zinc-400 tabular-nums">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {s.common_http_version ? (
                                      <span
                                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded shadow-sm ring-1 ring-inset ${s.common_http_version === 'HTTP/1.1'
                                          ? 'bg-amber-100/50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-800/50'
                                          : s.common_http_version === 'HTTP/3'
                                            ? 'bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-800/50'
                                            : 'bg-zinc-100/50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-400 ring-zinc-200/50 dark:ring-zinc-700/50'
                                          }`}
                                        title={`Protocol: ${s.common_http_version}`}
                                      >
                                        {s.common_http_version === 'HTTP/1.1' ? '1.1' : s.common_http_version === 'HTTP/3' ? 'H3' : 'H2'}
                                      </span>
                                    ) : (
                                      <span className="text-zinc-400 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {(() => {
                                      const code = s.status_code
                                      const color
                                        = code != null && code < 300
                                          ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                          : code != null && code < 400
                                            ? 'bg-blue-100/80 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                            : 'bg-red-100/80 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                      const hops = Number(s.redirect_count ?? 0)
                                      return (
                                        <div className="flex items-center justify-end gap-1.5">
                                          {hops > 0 && (
                                            <span className="inline-flex items-center rounded-md bg-violet-100/80 px-1 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" title={`${hops} redirect hop${hops === 1 ? '' : 's'}`}>
                                              {hops}↷
                                            </span>
                                          )}
                                          {isError ? (
                                            <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase dark:bg-red-950/50 dark:text-red-300" title={s.error}>
                                              ERR
                                            </span>
                                          ) : (
                                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${color}`}>
                                              {code ?? '—'}
                                            </span>
                                          )}
                                        </div>
                                      )
                                    })()}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-[10px] text-zinc-400 tabular-nums whitespace-nowrap">
                                    {s.last_probe_at ? new Date(s.last_probe_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                  </td>
                                  {process.env.NODE_ENV === 'development' && (
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                      <span className="text-[9px] font-bold text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-800/50 px-1 py-0.5 rounded">
                                        {s.probe_version || '—'}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeView === 'trends' && (
                <div className="space-y-10">
                  <section>
                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
                      Daily Insights — 24h Statistical Averages
                    </h2>
                    {stats.length === 0 ? (
                      <p className="text-sm text-zinc-400">Compiling historical insights...</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border bg-surface/30">
                        <table className="w-full text-sm">
                          <thead>
                            {(() => {
                              const hasEdgeData = stats.some(s => s.edge_hit_avg_ms !== null);
                              const hasOriginData = stats.some(s => s.origin_miss_avg_ms !== null);
                              const showSplitTtfb = hasEdgeData || hasOriginData;

                              // Contextual labels for the main TTFB column(s)
                              const ttfbHeaderLabel = showSplitTtfb ? "Avg TTFB" : "TTFB";
                              const ttfbHeaderTitle = showSplitTtfb
                                ? "The overall average Time to First Byte across all results (Hits and Misses)."
                                : "Average Time to First Byte (Total processing and travel time)";

                              return (
                                <>
                                  <tr className="border-b border-border bg-white/5 dark:bg-black/20">
                                    <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Region</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Average duration of DNS hostname resolution (mapping domain to IP).">DNS</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Average time to establish a TCP connection with the edge server.">TCP</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Average duration of the SSL/TLS handshake for a secure connection.">TLS</th>

                                    {showSplitTtfb ? (
                                      <>
                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight" title="Average Time to First Byte for Cache HITs (Edge performance)">Edge TTFB</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight" title="Average Time to First Byte for Cache MISS/Bypass (Server performance)">Origin TTFB</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight border-l border-zinc-100 dark:border-zinc-800" title="The overall average Time to First Byte across all results (Hits and Misses).">Avg TTFB</th>
                                      </>
                                    ) : (
                                      <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title={ttfbHeaderTitle}>{ttfbHeaderLabel}</th>
                                    )}


                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight whitespace-nowrap" title="The absolute minimum and maximum TTFB values observed in this region over the last 24h.">Min / Max</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Mean duration to download the entire response body after receiving the first byte of headers.">DL</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="The cumulative end-to-end duration for the full request-response lifecycle (Total = DNS + Connect + Wait + Download).">Total</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Average Edge Cache Hit ratio across all probes in this region.">Cache</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight" title="Regional availability percentage - success rate of all automated probes in the last 24h.">Uptime</th>
                                  </tr>
                                </>
                              )
                            })()}
                          </thead>
                          <tbody>
                            {(() => {
                              const hasEdgeData = stats.some(st => st.edge_hit_avg_ms !== null);
                              const hasOriginData = stats.some(st => st.origin_miss_avg_ms !== null);
                              const showSplitTtfb = hasEdgeData && hasOriginData;

                              return stats.map((s, i) => {
                                return (
                                  <tr
                                    key={s.region}
                                    className={i < stats.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}
                                  >
                                    <td className="px-3 py-2.5">
                                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap" title={REGION_DESCRIPTIONS[s.region] ?? s.region}>
                                        {REGION_LABELS[s.region] ?? s.region}
                                      </span>
                                    </td>
                                    <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.dns.text}`}>
                                      {s.dns_avg_ms != null ? `${s.dns_avg_ms}ms` : '—'}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.tcp.text}`}>
                                      {s.tcp_avg_ms != null ? `${s.tcp_avg_ms}ms` : '—'}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.tls.text}`}>
                                      {s.tls_avg_ms != null ? `${s.tls_avg_ms}ms` : '—'}
                                    </td>

                                    {showSplitTtfb ? (
                                      <>
                                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${edgeTtfbColor(s.edge_hit_avg_ms)}`}>
                                          {s.edge_hit_avg_ms != null ? `${s.edge_hit_avg_ms}ms` : '—'}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${originTtfbColor(s.origin_miss_avg_ms)}`}>
                                          {s.origin_miss_avg_ms != null ? `${s.origin_miss_avg_ms}ms` : '—'}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums border-l border-zinc-50 dark:border-zinc-800/50 ${ttfbColor(s.ttfb_avg_ms)}`}>
                                          {s.ttfb_avg_ms != null ? `${s.ttfb_avg_ms}ms` : '—'}
                                        </td>
                                      </>
                                    ) : (
                                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${ttfbColor(s.ttfb_avg_ms)}`}>
                                        {s.ttfb_avg_ms != null ? `${s.ttfb_avg_ms}ms` : '—'}
                                      </td>
                                    )}


                                    <td className="px-3 py-2.5 text-right text-[11px] text-zinc-500 tabular-nums whitespace-nowrap">
                                      {s.ttfb_min_ms != null ? `${s.ttfb_min_ms}ms / ${s.ttfb_max_ms}ms` : '—'}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right text-xs font-mono tabular-nums ${TIMING.download.text}`}>
                                      {s.download_avg_ms != null ? `${s.download_avg_ms}ms` : '—'}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right text-xs font-mono font-semibold tabular-nums ${TIMING.total.text}`}>
                                      {s.total_avg_ms != null ? `${s.total_avg_ms}ms` : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      {(() => {
                                        const cache = cacheDisplay(s.common_cache_status, s.cache_hit_pct)
                                        return (
                                          <div className="flex flex-col items-end">
                                            <span className={`${cache.text.includes('%') || cache.text === '—' ? 'text-xs' : 'text-[10px]'} font-bold uppercase ${cache.tone}`} title={cache.title}>
                                              {cache.text}
                                            </span>
                                          </div>
                                        )
                                      })()}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${uptimeColor(s.uptime_pct, s.error_count)}`}>
                                      {s.uptime_pct != null ? `${formatPct(s.uptime_pct)}%` : '—'}
                                    </td>
                                  </tr>
                                )
                              })
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

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

              {activeView === 'diagnostics' && (
                <div className="space-y-10">
                  {waterfallProbes.length > 0 ? (
                    <ProbeWaterfall probes={waterfallProbes} />
                  ) : (
                    <p className="text-sm text-zinc-400 italic">No diagnostic data available yet.</p>
                  )}
                </div>
              )}

              {activeView === 'infrastructure' && (
                <div className="space-y-10">
                  <BypassAudit data={hourlyBypass} regionLabels={REGION_LABELS} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'resilience' && (
            <div className="space-y-8">
              <section>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
                  Uptime Resilience
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {stats.map(s => (
                    <div key={s.region} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight mb-1">{REGION_LABELS[s.region] ?? s.region}</p>
                      <div className="flex items-end justify-between">
                        <span className={`text-xl font-bold tabular-nums ${uptimeColor(s.uptime_pct)}`}>
                          {s.uptime_pct != null ? `${s.uptime_pct}%` : '—'}
                        </span>
                        <span className="text-[10px] text-zinc-500 italic pb-1">24h availability</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
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
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
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
                    {mainProfile.headers?.ssl && (
                      <section className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          SSL / TLS Profile
                        </h3>
                        <div className="rounded-2xl border border-border bg-surface p-6 flex flex-wrap items-center justify-between gap-6 shadow-sm">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Issuer</p>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{mainProfile.headers.ssl.issuer || 'Unknown CA'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Protocol</p>
                            <p className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-white/5 dark:bg-white/5 px-2 py-0.5 rounded">{mainProfile.headers.ssl.protocol || 'TLS'}</p>
                          </div>
                          <div className="space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-6">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Expires In</p>
                            <p className={`font-bold tabular-nums ${(mainProfile.headers.ssl.days_remaining ?? 99) < 15 ? 'text-red-500 animate-pulse' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {mainProfile.headers.ssl.days_remaining} days
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Valid To</p>
                            <p className="text-[11px] font-mono text-zinc-500">{new Date(mainProfile.headers.ssl.valid_to || '').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Perfil Global / Principal */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Global Security Profile</h3>
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
                                    <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tight ring-1 ring-inset ring-zinc-200/50 dark:ring-zinc-700/50">Missing</span>
                                  )}
                                </div>
                                {present && (() => {
                                  const valStr = String(value)
                                  if (valStr.length < 160) {
                                    return (
                                      <div className="rounded border border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 p-2 text-wrap">
                                        <code className="block text-[10px] text-zinc-600 dark:text-zinc-400 break-all font-mono leading-relaxed">
                                          {valStr}
                                        </code>
                                      </div>
                                    )
                                  }
                                  return (
                                    <details className="group">
                                      <summary className="flex items-center gap-1.5 cursor-pointer list-none outline-none">
                                        <div className="rounded border border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 p-2 flex-1 min-w-0">
                                          <code className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono block truncate">
                                            {valStr.slice(0, 100)}...
                                          </code>
                                        </div>
                                        <div className="flex flex-col items-center gap-0.5 px-1">
                                          <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter group-open:hidden">Full</span>
                                          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter hidden group-open:inline">Less</span>
                                        </div>
                                      </summary>
                                      <div className="mt-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 shadow-inner ring-1 ring-emerald-500/10">
                                        <code className="block text-[10px] text-zinc-600 dark:text-zinc-400 break-all font-mono leading-relaxed">
                                          {valStr}
                                        </code>
                                      </div>
                                    </details>
                                  )
                                })()}
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
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
                                        <div><span className="text-zinc-400">Main:</span><br /><span className="text-emerald-600 line-through opacity-50">{String((mainVal || 'Missing'))}</span></div>
                                        <div><span className="text-red-600 font-bold">Drift:</span><br /><span className="text-red-700 dark:text-red-400">{String((driftVal || 'Missing'))}</span></div>
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
                            <p className="text-[10px] text-zinc-400 font-mono tracking-tighter">{extractPop(row.served_by) ?? '—'}</p>
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

          {activeTab === 'incidents' && (
            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-zinc-400" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Last 24h Volume</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      {incidentTrends.reduce((sum, t) => sum + t.count, 0)}
                    </span>
                    <span className="text-xs text-zinc-400">total incidents</span>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-zinc-400" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Main Vector</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 uppercase truncate">
                      {alerts.length > 0 ? (ALERT_TYPE_LABELS[alerts[0].alert_type as AlertType] ?? 'N/A') : 'Clear'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-zinc-400" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Peak Deviation</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${alerts.some(a => (a.deviation_factor ?? 0) > 3) ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {alerts.length > 0 ? `${Math.max(...alerts.map(a => a.deviation_factor ?? 0)).toFixed(1)}x` : '1.0x'}
                    </span>
                  </div>
                </div>
              </div>

              {incidentTrends.length > 0 && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/20 p-4">
                  <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    24h Recurrence Trends
                  </h3>
                  <div className="h-24 w-full flex items-end gap-1 px-1">
                    {(() => {
                      const maxCount = Math.max(...incidentTrends.map(t => t.count), 1)
                      // Preenche buracos se houver menos de 24 buckets (horas sem alertas)
                      // Para simplificar, vamos apenas mostrar o que temos ou iterar 24h
                      const now = new Date()
                      const last24h = Array.from({ length: 24 }, (_, i) => {
                        const d = new Date(now)
                        d.setHours(d.getHours() - (23 - i), 0, 0, 0)
                        const match = incidentTrends.find(t => new Date(t.bucket).getHours() === d.getHours())
                        return { label: d.getHours(), count: match ? match.count : 0 }
                      })

                      return last24h.map((t, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center group relative">
                          <div
                            className={`w-full rounded-t-sm transition-all ${t.count > 0 ? 'bg-red-500/60 group-hover:bg-red-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                            style={{ height: `${Math.max((t.count / maxCount) * 100, 4)}%` }}
                          >
                            {t.count > 0 && (
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10">
                                {t.count} incidents @ {t.label}:00
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                  <div className="flex justify-between mt-2 px-1 text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">
                    <span>24h ago</span>
                    <span>Now</span>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                  <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-tight flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Incident History
                  </h2>
                  <div className="flex flex-wrap gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg">
                    <Link
                      href={buildMonitorHref('incidents', range, null)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all ${filteredAlertType == null
                        ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                        }`}
                    >
                      All
                    </Link>
                    {VALID_ALERT_TYPES.map(type => (
                      <Link
                        key={type}
                        href={buildMonitorHref('incidents', range, type)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all ${filteredAlertType === type
                          ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                          }`}
                      >
                        {ALERT_TYPE_LABELS[type]}
                      </Link>
                    ))}
                  </div>
                </div>

                {alerts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck className="w-6 h-6 text-emerald-500" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No Incidents Detected</h3>
                    <p className="text-xs text-zinc-500 mt-1 max-w-[240px] mx-auto">This monitor is currently healthy and performing within expected baselines.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/20">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Timestamp</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Region</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Event Type</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Metric</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Baseline</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Actual</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {alerts.map((alert) => {
                          const severity = (alert.deviation_factor ?? 0) > 4 ? 'CRITICAL' : (alert.deviation_factor ?? 0) > 2 ? 'WARNING' : 'STATED';
                          const severityColor = severity === 'CRITICAL' ? 'bg-red-500 text-white' : severity === 'WARNING' ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400';

                          return (
                            <tr key={alert.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3.5">
                                <span className="text-[11px] text-zinc-500 font-medium tabular-nums">
                                  {new Date(alert.created_at).toLocaleString('en-US', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                  {REGION_LABELS[alert.region] ?? alert.region}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2">
                                  {alert.alert_type === 'anomaly' ? (
                                    <Zap className="w-3 h-3 text-amber-500" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3 text-red-500" />
                                  )}
                                  <span className="text-[11px] font-bold uppercase tracking-tight text-zinc-600 dark:text-zinc-400">
                                    {ALERT_TYPE_LABELS[alert.alert_type as AlertType] ?? alert.alert_type.replace('_', ' ')}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <code className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                                  {alert.metric}
                                </code>
                              </td>
                              <td className="px-4 py-3.5 text-right text-xs tabular-nums text-zinc-400">
                                {formatMs(alert.baseline_ms)}
                              </td>
                              <td className="px-4 py-3.5 text-right text-xs tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                                {formatMs(alert.actual_ms)}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black tracking-tighter ${severityColor}`}>
                                  {alert.deviation_factor != null ? `${alert.deviation_factor.toFixed(1)}X` : '-'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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

