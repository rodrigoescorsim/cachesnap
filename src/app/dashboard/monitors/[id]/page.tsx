import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import { TtfbChart, type ChartPoint } from './ttfb-chart'
import { MonitorHeaderToolbar } from './monitor-header-toolbar'
import { MonitorOnDemandPanel } from './monitor-on-demand'
import { MonitorSettingsPanel } from './monitor-settings-panel'
import { RealTimeHub } from '../../real-time-hub'
import { extractPop, popToCity, resolveCdnLabel } from '@/lib/edge-helpers'
import { ProbeWaterfall, type WaterfallProbe } from './probe-waterfall'
import { MonitorSidebarRail } from './monitor-sidebar-rail'
import {
  buildMonitorHref,
  buildViewHref,
  type AlertType,
  type MonitorTab,
  type PerformanceView,
} from './monitor-href'
import { TIMING } from './timing-metrics-palette'
import { VisualGlow } from '../../visual-glow'
import {
  Activity,
  ShieldCheck,
  Lock,
  AlertCircle,
  PlayCircle,
  History,
  AlertTriangle,
  TrendingUp,
  Zap,
  Fingerprint,
  Settings,
} from 'lucide-react'
import {
  BRAND_CARD_SURFACE_GRADIENT,
  BRAND_TABLE_SURFACE_GRADIENT,
  MONITOR_TABLE,
  TH_TTFB_HEADER,
  TH_TTFB_HEADER_ORIGIN,
  ttfbColor,
  ttfbMetricCellClass,
  edgeTtfbMetricCellClass,
  originTtfbMetricCellClass,
} from './monitor-table-styles'

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
  common_cdn_provider: string | null
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
  common_cdn_provider: string | null
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
    issuer_o?: string | null
    issuer_cn?: string | null
    subject_cn?: string | null
    subject_o?: string | null
    protocol?: string
    fingerprint256?: string | null
    bits?: number | null
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
  cdn_provider: string | null
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
  'sa-east': 'São Paulo',
  'eu-west': 'Frankfurt',
  'us-east': 'Ohio',
  'us-west': 'Oregon',
  'ap-east': 'Tokyo',
  'ap-south': 'Mumbai',
  'oc': 'Sydney',
  'af-south': 'Cape Town',
}

function formatCertDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function certTotalDays(ssl: NonNullable<SecurityHeaders['ssl']>): number | null {
  if (!ssl.valid_from || !ssl.valid_to) return null
  const a = new Date(ssl.valid_from).getTime()
  const b = new Date(ssl.valid_to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  return Math.floor((b - a) / 86400000)
}

function certRenewalPercentLeft(ssl: NonNullable<SecurityHeaders['ssl']>): number | null {
  const total = certTotalDays(ssl)
  const rem = ssl.days_remaining
  if (total == null || total <= 0 || rem == null) return null
  if (rem <= 0) return 0
  return Math.min(100, Math.max(0, (rem / total) * 100))
}

function formatFingerprintDisplay(fp: string | undefined | null): { short: string; full: string } | null {
  if (!fp || typeof fp !== 'string') return null
  const full = fp.toUpperCase()
  const hex = full.replace(/:/g, '')
  if (hex.length < 16) return { short: full, full }
  return { short: `${hex.slice(0, 6)}…${hex.slice(-6)}`, full }
}

const VALID_TABS = ['performance', 'on-demand', 'resilience', 'security', 'settings', 'incidents'] as const satisfies readonly MonitorTab[]

const TAB_LABELS: Record<MonitorTab, string> = {
  performance: 'Performance',
  'on-demand': 'On-demand',
  resilience: 'Resilience',
  security: 'Security',
  settings: 'Settings',
  incidents: 'Alerts',
}

const TAB_ICONS: Record<MonitorTab, any> = {
  performance: Activity,
  'on-demand': PlayCircle,
  resilience: ShieldCheck,
  security: Lock,
  settings: Settings,
  incidents: AlertCircle,
}

const VALID_PERFORMANCE_VIEWS = ['real-time', 'trends', 'diagnostics', 'infrastructure'] as const satisfies readonly PerformanceView[]

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Real-time',
  trends: 'Trends',
  diagnostics: 'Diagnostics',
  infrastructure: 'Infrastructure',
}

/** Monitor title card — subtle top wash + glass (Vercel-style). Densidade ~tool (menos padding vertical). */
const MONITOR_HEADER_CARD =
  'cs-card cs-card-glass px-5 py-3.5 relative'

/** Status pills in the monitor title bar — consistent shell + interactive hover. */
const MONITOR_HEADER_STATUS_BADGE =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border bg-white/5 px-2.5 py-0 text-[10px] font-bold uppercase tracking-tight transition-colors hover:bg-white/10 text-zinc-300'

/** Active monitor dot — soft mint glow + pulse (“system alive”). */
const MONITOR_HEADER_ACTIVE_DOT =
  'bg-emerald-500 [box-shadow:0_0_8px_rgba(16,185,129,0.5)]'

const VALID_ALERT_TYPES = ['down', 'anomaly', 'anycast', 'zombie_cache'] as const satisfies readonly AlertType[]

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  down: 'Offline',
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
function formatCacheAgeShort(seconds: number): React.ReactNode {
  const unitStyle = "text-[9px] opacity-70 ml-0.5 font-medium"
  if (seconds < 60) return <>{seconds}<span className={unitStyle}>s</span></>
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return <>{minutes}<span className={unitStyle}>m</span></>
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return <>{hours}<span className={unitStyle}>h</span></>
  const days = Math.floor(hours / 24)
  return <>{days}<span className={unitStyle}>d</span></>
}

/** `Age` header semantics: seconds in shared cache. Tiers for emphasis (zombie_cache alert: age_s > 86_400). */
const AGE_RECENT_MAX_S = 3600 // ≤1h — still “fresh” at the edge
const AGE_ZOMBIE_THRESHOLD_S = 86_400 // same boundary as probe-waterfall zombie detection (strictly older = red)

function ageBadgeVisual(ageSeconds: number): { className: string; tierHint: string } {
  if (ageSeconds <= AGE_RECENT_MAX_S) {
    return {
      className: 'cs-badge-flat-success',
      tierHint: 'Recently cached (≤1h)',
    }
  }
  if (ageSeconds <= AGE_ZOMBIE_THRESHOLD_S) {
    return {
      className: 'cs-badge-flat-warning',
      tierHint: 'Elevated cache age (>1h, up to 24h)',
    }
  }
  return {
    className: 'cs-badge-flat-error',
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

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function formatMs(value: number | null): string {
  if (value == null) return '-'
  return `${Math.round(value)}ms`
}

import { BypassAudit } from './bypass-audit'

/** High-fidelity glassmorphism tooltip to replace native browser 'title' attributes. */
function PremiumTooltip({ children, content, position = 'top-center', direction = 'top' }: { children: React.ReactNode, content: React.ReactNode, position?: 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left', direction?: 'top' | 'bottom' }) {
  const isBottom = direction === 'bottom'
  
  const posClasses = {
    'top-center': 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    'top-right': 'bottom-full right-0 mb-2',
    'top-left': 'bottom-full left-0 mb-2',
    'bottom-center': 'top-full left-1/2 -translate-x-1/2 mt-2',
    'bottom-right': 'top-full right-0 mt-2',
    'bottom-left': 'top-full left-0 mt-2',
  }[position]

  return (
    <div className="relative group/tooltip inline-flex items-center">
      {children}
      <div className={`absolute ${posClasses} invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 ${isBottom ? '-translate-y-1 group-hover/tooltip:translate-y-0' : 'translate-y-1 group-hover/tooltip:translate-y-0'} z-[100] pointer-events-none`}>
        <div className="bg-[#111d32]/98 backdrop-blur-xl border border-white/10 rounded-xl p-3.5 shadow-2xl text-[11px] font-medium text-zinc-200 whitespace-nowrap ring-1 ring-white/5">
          {content}
        </div>
      </div>
    </div>
  )
}

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

  const range = rangeValue === '7d' ? '7d' : rangeValue === '30d' ? '30d' : '24h'
  const dbInterval = range === '7d' ? '7 days' : range === '30d' ? '30 days' : '24 hours'
  const bucketSize = range === '7d' ? '6 hours' : range === '30d' ? '1 day' : '30 minutes'
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
          AND a.time > NOW() - CAST(${dbInterval} AS interval)
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
      MODE() WITHIN GROUP (ORDER BY cdn_provider) AS common_cdn_provider,
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
      AND time > NOW() - CAST(${dbInterval} AS interval)
    GROUP BY region ORDER BY region
  `

  const prevStats = await sql<{ ttfb_avg_ms: number; cache_hit_pct: number; uptime_pct: number }[]>`
    SELECT
      ROUND(AVG(ttfb_ms)::numeric, 0)::int            AS ttfb_avg_ms,
      ROUND(100.0 * COUNT(*) FILTER (WHERE cache_status ILIKE '%HIT%') / NULLIF(COUNT(*), 0), 1) AS cache_hit_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE error IS NULL AND status_code < 500) / NULLIF(COUNT(*), 0), 1) AS uptime_pct
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - (2 * CAST(${dbInterval} AS interval))
      AND time <= NOW() - CAST(${dbInterval} AS interval)
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
      cdn_provider AS common_cdn_provider,
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
    WHERE monitor_id = ${id} AND created_at > NOW() - CAST(${dbInterval} AS interval)
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

  const chartRaw = await sql<{ bucket: Date; region: string; ttfb_avg: number; dns_avg: number | null; tcp_avg: number | null; tls_avg: number | null; cache_hit_pct: number | null }[]>`
    SELECT
      time_bucket(CAST(${bucketSize} AS interval), time) AS bucket,
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
      AND time > NOW() - CAST(${dbInterval} AS interval)
      AND ttfb_ms IS NOT NULL
    GROUP BY bucket, region
    ORDER BY bucket ASC, region ASC
  `

  const hourlyBypass = (activeView === 'infrastructure' || activeView === 'diagnostics')
    ? await sql<{ hour: Date; region: string; edge_ttfb: number; origin_ttfb: number; savings: number; edge_cache_status: string | null; origin_cache_status: string | null }[]>`
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
          AND time > NOW() - CAST(${dbInterval} AS interval)
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2 ASC
      `
    : []

  const spikes = await sql<Spike[]>`
    WITH bucketed AS (
      SELECT
        time_bucket(CAST(${bucketSize} AS interval), time) AS bucket,
        region,
        ROUND(AVG(ttfb_ms)::numeric, 0) AS ttfb_avg
      FROM probe_results
      WHERE monitor_id = ${id}
        AND time > NOW() - CAST(${dbInterval} AS interval)
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
      cdn_provider,
      time AS sampled_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - CAST(${dbInterval} AS interval)
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
      cdn_provider,
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
  const totalProbes = stats.reduce((sum, s) => sum + s.probe_count, 0)
  const isCollecting = totalProbes < 3

  // AGGREGATE CALCULATIONS FOR SUMMARY CARDS
  const avgTtfb = stats.length > 0 
    ? Math.round(stats.reduce((acc, s) => acc + (s.ttfb_avg_ms || 0), 0) / stats.length) 
    : 0;
  
  const totalHitProbes = stats.reduce((acc, s) => acc + Math.round((s.cache_hit_pct || 0) * s.probe_count / 100), 0);
  const totalProbesCount = stats.reduce((acc, s) => acc + s.probe_count, 0);
  const globalHitRate = totalProbesCount > 0 ? Math.round((totalHitProbes / totalProbesCount) * 100) : 0;

  const validUptimeStats = stats.filter(s => typeof s.uptime_pct === 'number');
  const globalUptime = validUptimeStats.length > 0
    ? validUptimeStats.reduce((acc, s) => acc + (s.uptime_pct || 0), 0) / validUptimeStats.length
    : 100;
    
  // Simple heuristic: Uptime + TTFB performance vs 300ms baseline
  const ttfbPenalty = Math.max(0, (avgTtfb - 300) / 10);
  const healthScore = Math.max(0, Math.min(100, Math.round(globalUptime - ttfbPenalty)));

  // PREVIOUS PERIOD TOTALS FOR TRENDS
  const hasHistory = prevStats.length > 0 && prevStats[0].ttfb_avg_ms !== null;
  const prevData = hasHistory ? prevStats[0] : null;
  
  const prevAvgTtfb = prevData ? Number(prevData.ttfb_avg_ms || 0) : 0;
  const prevGlobalHitRate = prevData ? Math.round(Number(prevData.cache_hit_pct || 0)) : 0;
  const prevGlobalUptime = prevData ? Number(prevData.uptime_pct || 100) : 100;
  const prevTtfbPenalty = Math.max(0, (prevAvgTtfb - 300) / 10);
  const prevHealthScore = Math.max(0, Math.min(100, Math.round(prevGlobalUptime - prevTtfbPenalty)));

  const healthDelta = hasHistory ? healthScore - prevHealthScore : 0;
  const ttfbDelta = hasHistory ? avgTtfb - prevAvgTtfb : 0;
  const cacheDelta = hasHistory ? globalHitRate - prevGlobalHitRate : 0;

  return (
    <div className="space-y-6">
      <RealTimeHub userId={user.id} watchId={monitor.id} />
      <AutoRefresh />
      <div className={`${MONITOR_HEADER_CARD} min-w-0`}>
        {/* Uma linha: contexto (esq.) | estado + ações (dir.) — alinhamento tipo SaaS */}
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 max-w-full shrink sm:max-w-[min(100%,28rem)] sm:pr-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.5px] text-zinc-900 dark:text-zinc-50">
              {monitorDisplayName}
            </h1>
            <p className="mt-0.5 truncate text-[13px] tracking-tight text-zinc-600 opacity-60 dark:text-zinc-400">
              {monitor.url}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:gap-x-3 sm:gap-y-2">
            <div
              className="flex flex-wrap items-center justify-end gap-2 sm:gap-3"
              aria-label="Monitor status"
            >
              <PremiumTooltip content={monitor.is_active ? 'Monitor is collecting probes and heartbeats' : 'Monitoring is currently paused'} position="top-left">
                <div className={MONITOR_HEADER_STATUS_BADGE}>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${monitor.is_active ? MONITOR_HEADER_ACTIVE_DOT : 'bg-zinc-400 dark:bg-zinc-500'}`}
                    aria-hidden
                  />
                  <span className="text-zinc-600 dark:text-zinc-300">{monitor.is_active ? 'Active' : 'Paused'}</span>
                </div>
              </PremiumTooltip>

              <PremiumTooltip content="Time elapsed since the last probe batch was received from our edge nodes" position="top-left">
                <div className={MONITOR_HEADER_STATUS_BADGE}>
                  <History className="h-3 w-3 text-zinc-500" />
                  <span className="text-zinc-500 dark:text-zinc-400">Last check: 42s ago</span>
                </div>
              </PremiumTooltip>

              <PremiumTooltip content="Real-time data stream — Live Performance updates" position="top-left">
                <Link
                  href={buildMonitorHref('performance', range)}
                  className={MONITOR_HEADER_STATUS_BADGE}
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">Live Sync</span>
                </Link>
              </PremiumTooltip>
            </div>

            <div
              className="flex shrink-0 items-center gap-2 sm:gap-3"
              aria-label="Monitor actions"
            >
              <div
                className="h-6 w-px shrink-0 bg-black/[0.08] opacity-30 dark:bg-white/[0.05]"
                aria-hidden
              />
              <MonitorHeaderToolbar id={monitor.id} isActive={monitor.is_active} range={range} />
            </div>
          </div>
        </div>
      </div>

      {!isCollecting && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* HEALTH SCORE CARD */}
          <div className="cs-card p-5 group">
            <div className="cs-card-wash opacity-40" />
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <PremiumTooltip content="Weighted performance score based on availability and network latency thresholds">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-1 border-b border-dashed border-zinc-700 hover:border-zinc-500 cursor-help transition-colors">Health Score</p>
                </PremiumTooltip>
                <Activity className={`h-4 w-4 ${healthScore > 90 ? 'text-emerald-400' : 'text-amber-400'}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white tracking-tight">{healthScore}/<span className="text-zinc-600">100</span></span>
                {hasHistory && healthDelta !== 0 && (
                  <PremiumTooltip content={`${healthDelta > 0 ? '+' : ''}${healthDelta}% compared to the previous ${range}`} position="top-center" direction="top">
                    <span className={`text-[11px] font-bold cursor-help ${healthDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {healthDelta > 0 ? '↑' : '↓'} {Math.abs(healthDelta)}%
                    </span>
                  </PremiumTooltip>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 font-medium">Global infrastructure stability</p>
            </div>
          </div>

          {/* GLOBAL TTFB CARD */}
          <div className="cs-card p-5 group">
            <div className="cs-card-wash opacity-40" />
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <PremiumTooltip content="Global average Time to First Byte across all monitored regions">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-1 border-b border-dashed border-zinc-700 hover:border-zinc-500 cursor-help transition-colors">Global TTFB</p>
                </PremiumTooltip>
                <Zap className={`h-4 w-4 ${avgTtfb < 200 ? 'text-emerald-400' : avgTtfb < 500 ? 'text-amber-400' : 'text-red-400'}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white tracking-tight">{avgTtfb}<span className="text-lg ml-0.5 text-zinc-500">ms</span></span>
                {hasHistory && ttfbDelta !== 0 && (
                  <PremiumTooltip content={`${ttfbDelta > 0 ? '+' : '-'}${Math.abs(ttfbDelta)}ms compared to the previous ${range}`} position="top-center" direction="top">
                    <span className={`text-[11px] font-bold cursor-help ${ttfbDelta <= 0 ? 'text-emerald-400' : 'text-amber-500'}`}>
                      {ttfbDelta <= 0 ? '↓' : '↑'} {Math.abs(ttfbDelta)}ms
                    </span>
                  </PremiumTooltip>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 font-medium">Network latency across {stats.length} regions</p>
            </div>
          </div>

          {/* CACHE HIT RATE CARD */}
          <div className="cs-card p-5 group">
            <div className="cs-card-wash opacity-60 bg-gradient-to-br from-emerald-500/5 to-transparent" />
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <PremiumTooltip content="Overall percentage of requests successfully served from CDN edge cache">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-1 border-b border-dashed border-zinc-700 hover:border-zinc-500 cursor-help transition-colors">Cache Hit Rate</p>
                </PremiumTooltip>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-bold text-white tracking-tight">{globalHitRate}<span className="text-lg ml-0.5 text-zinc-500">%</span></span>
                {hasHistory && cacheDelta !== 0 && (
                  <PremiumTooltip content={`${cacheDelta > 0 ? '+' : ''}${cacheDelta}% compared to the previous ${range}`} position="top-center" direction="top">
                    <span className={`text-[11px] font-bold cursor-help ${cacheDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {cacheDelta >= 0 ? '↑' : '↓'} {Math.abs(cacheDelta)}%
                    </span>
                  </PremiumTooltip>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 font-medium">Total edge delivery efficiency</p>
            </div>
          </div>

          {/* ACTIVE ALERTS CARD */}
          <div className="cs-card p-5 group">
            <div className={`cs-card-wash ${alerts.length > 0 ? 'opacity-40 bg-gradient-to-br from-red-500/10 to-transparent' : 'opacity-40'}`} />
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <PremiumTooltip content="Count of anomalous events or performance degradations detected in the last specified period">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-1 border-b border-dashed border-zinc-700 hover:border-zinc-500 cursor-help transition-colors">Active Alerts</p>
                </PremiumTooltip>
                <AlertTriangle className={`h-4 w-4 ${alerts.length > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className={`text-3xl font-bold tracking-tight ${alerts.length > 0 ? 'text-red-400' : 'text-white'}`}>
                  {alerts.length === 0 ? 'Clean' : alerts.length}
                </span>
                {alerts.length > 0 && (
                  <PremiumTooltip content={`Total alerts detected during the last ${range}`} position="top-center" direction="top">
                    <span className="text-[11px] font-bold text-zinc-500 cursor-help underline decoration-zinc-700 decoration-dashed underline-offset-2">Last {range}</span>
                  </PremiumTooltip>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 font-medium">Real-time anomaly detection</p>
            </div>
          </div>
        </div>
      )}

      {isCollecting && (
        <div className="cs-tint-warning p-4 flex items-start gap-4">
          <div className="cs-card-wash" />
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-300/80">Collecting data</p>
            <p className="text-sm text-amber-200/60 mt-1 leading-relaxed">
              We&apos;re running the first probes. Results will appear within 5 minutes. Stats below may not be representative yet.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
        <MonitorSidebarRail
          range={range}
          activeTab={activeTab}
          activeView={activeView}
          filteredAlertType={filteredAlertType}
        />

        <div className="min-w-0 space-y-8">
          {activeTab === 'performance' && (
            <div>
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
                      <div className={MONITOR_TABLE.outerWrapper}>
                        <div className={BRAND_TABLE_SURFACE_GRADIENT} />
                        <div className={MONITOR_TABLE.innerScroll}>
                        <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition}`}>
                          <thead>
                            <tr className={MONITOR_TABLE.theadRow}>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Region where the probe was executed" position="top-center" direction="top">Region</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Point of presence (PoP) inferred from response headers" position="top-center" direction="top">Served from</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Edge provider identity (explicit header or inferred from response)" position="top-center" direction="top">Served by</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Cache status from headers" position="top-center" direction="top">Cache</PremiumTooltip>
                              </th>
                              <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                                <PremiumTooltip content="Time to first byte" position="top-center" direction="top">TTFB</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Network Handshake (DNS + TCP + TLS)" position="top-center" direction="top">Net</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Age header (shared cache)" position="top-center" direction="top">Age</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="HTTP status code" position="top-center" direction="top">Status</PremiumTooltip>
                              </th>
                              <th className="cs-table-compact-th !text-center">
                                <PremiumTooltip content="Last synchronization time" position="top-center" direction="top">Sync</PremiumTooltip>
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
                            {latestProbes.map((s) => {
                              const isError = s.error && s.error !== ''
                              const cache = cacheDisplay(s.common_cache_status, null)
                              const age = Number(s.max_age_s ?? 0)
                              const ageVisual = age > 0 ? ageBadgeVisual(age) : null
                              const ageBadgeTitle
                                = age > 0 && ageVisual
                                  ? `Age header: ${age}s — ${ageVisual.tierHint}`
                                  : ''
                              return (
                                <tr
                                  key={s.region}
                                  className={MONITOR_TABLE.tbodyRow}
                                >
                                  <td className="cs-table-compact-td font-bold text-zinc-200">
                                    <PremiumTooltip content={REGION_DESCRIPTIONS[s.region] ?? s.region} position="top-left">
                                      {REGION_LABELS[s.region] ?? s.region}
                                    </PremiumTooltip>
                                  </td>
                                  <td className="cs-table-compact-td text-center">
                                    <PremiumTooltip content={extractPop(s.common_served_by) || 'Unknown Point of Presence'} position="top-left">
                                      <span className="cs-pop-tag uppercase">
                                        {s.common_served_by ? (popToCity(extractPop(s.common_served_by) || '') || extractPop(s.common_served_by)) : '—'}
                                      </span>
                                    </PremiumTooltip>
                                  </td>
                                  <td className="cs-table-compact-td text-center">
                                    <PremiumTooltip
                                      content={s.common_served_by ? `Raw served_by: ${s.common_served_by}` : 'No edge hint'}
                                      position="top-center"
                                      direction="top"
                                    >
                                      <span className="cs-pop-tag max-w-[9rem] truncate">
                                        {resolveCdnLabel(s.common_cdn_provider, s.common_served_by) ?? '—'}
                                      </span>
                                    </PremiumTooltip>
                                  </td>
                                  <td className="cs-table-compact-td text-center">
                                    <PremiumTooltip content={cache.title} position="top-center" direction="top">
                                      {cache.text === 'HIT' ? (
                                        <span className="cs-badge cs-badge-success text-[11px] px-2.5 py-1 min-w-[62px] justify-center">
                                          <Zap className="w-[11px] h-[11px] fill-current" />
                                          {cache.text}
                                        </span>
                                      ) : (
                                        <span className="cs-badge-flat cs-badge-flat-warning text-[11px] px-2.5 py-1 min-w-[62px] justify-center font-bold">
                                          {cache.text}
                                        </span>
                                      )}
                                    </PremiumTooltip>
                                  </td>
                                  <td className={`${ttfbMetricCellClass(s.ttfb_ms)} !px-3 !py-2 text-[13px]`}>
                                    <PremiumTooltip content="Response time for this specific probe" position="top-right" direction="top"><VisualGlow value={s.ttfb_ms}>{s.ttfb_ms != null ? `${Math.round(s.ttfb_ms)}ms` : '—'}</VisualGlow></PremiumTooltip>
                                  </td>
                                  <td className="cs-table-compact-td-mono text-right relative group/net">
                                    <span className="text-zinc-400 cursor-help border-b border-dashed border-zinc-700/50 hover:border-zinc-500 transition-colors pb-0.5">
                                      {Math.round((s.dns_ms || 0) + (s.tcp_ms || 0) + (s.tls_ms || 0))}<span className="text-[9px] ml-0.5 opacity-50 font-sans">ms</span>
                                    </span>
                                    {/* Glass Tooltip */}
                                    <div className="absolute bottom-full right-0 mb-2 invisible group-hover/net:visible opacity-0 group-hover/net:opacity-100 transition-all duration-200 translate-y-2 group-hover/net:translate-y-0 z-50">
                                      <div className="bg-[#111d32]/95 backdrop-blur-xl border border-white/10 rounded-lg p-2.5 shadow-2xl min-w-[140px] text-left">
                                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Network Breakdown</p>
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-center gap-4">
                                            <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                                              <div className="w-1 h-1 rounded-full bg-purple-500" /> DNS
                                            </span>
                                            <span className="text-[10px] font-mono font-bold text-zinc-300">{Math.round(s.dns_ms || 0)}ms</span>
                                          </div>
                                          <div className="flex justify-between items-center gap-4">
                                            <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                                              <div className="w-1 h-1 rounded-full bg-blue-500" /> TCP
                                            </span>
                                            <span className="text-[10px] font-mono font-bold text-zinc-300">{Math.round(s.tcp_ms || 0)}ms</span>
                                          </div>
                                          <div className="flex justify-between items-center gap-4">
                                            <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                                              <div className="w-1 h-1 rounded-full bg-fuchsia-500" /> TLS
                                            </span>
                                            <span className="text-[10px] font-mono font-bold text-zinc-300">{Math.round(s.tls_ms || 0)}ms</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="cs-table-compact-td text-right">
                                    {age > 0 && ageVisual ? (
                                      <PremiumTooltip content={ageBadgeTitle} position="top-right" direction="top">
                                        <span className={`cs-badge-flat ${ageVisual.className}`}>
                                          {formatCacheAgeShort(age)}
                                        </span>
                                      </PremiumTooltip>
                                    ) : (
                                      <span className="text-[10px] text-zinc-500 tabular-nums">—</span>
                                    )}
                                  </td>
                                  <td className="cs-table-compact-td text-right">
                                    {(() => {
                                      const code = s.status_code
                                      const isErr = isError || (code != null && code >= 400)
                                      const colorClass = code != null && code < 400 ? 'cs-badge-flat-success' : 'cs-badge-flat-danger';
                                      const hops = Number(s.redirect_count ?? 0)
                                      return (
                                        <div className="flex items-center justify-end gap-1">
                                          {hops > 0 && (
                                            <PremiumTooltip content={`This request was redirected ${hops} times.`} position="top-right">
                                              <span className="cs-badge-flat cs-badge-flat-muted" style={{ fontSize: '8px' }}>{hops}↷</span>
                                            </PremiumTooltip>
                                          )}
                                          {isErr ? (
                                            <PremiumTooltip content={s.error || 'The edge server returned an error status or connection failed.'} position="top-right" direction="top">
                                              <span className="cs-badge-flat cs-badge-flat-danger">ERR</span>
                                            </PremiumTooltip>
                                          ) : (
                                            <PremiumTooltip content="Request completed successfully (200 OK)" position="top-right" direction="top"><span className={`cs-badge-flat ${colorClass}`}>{code || '200'}</span></PremiumTooltip>
                                          )}
                                        </div>
                                      )
                                    })()}
                                  </td>
                                  <td className="cs-table-compact-td text-right !text-zinc-600 !text-[10px] tabular-nums">
                                    {s.last_probe_at ? (
                                       <PremiumTooltip content={`Probe synchronized at ${new Date(s.last_probe_at).toLocaleString()}`} position="top-right" direction="top">
                                         {new Date(s.last_probe_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                       </PremiumTooltip>
                                     ) : '—'}
                                  </td>
                                  {process.env.NODE_ENV === 'development' && (
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
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
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeView === 'trends' && (
                <div className="space-y-10">
                  <section>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                        Global Performance • Last {range.toUpperCase()}
                      </h2>
                      <div className="flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 p-1 border border-zinc-200 dark:border-white/10">
                        {['24h', '7d', '30d'].map((r) => (
                           <Link
                             key={r}
                             href={buildViewHref(activeView, r)}
                             className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                               range === r 
                               ? 'bg-zinc-100 text-zinc-900 shadow-lg shadow-white/5 ring-1 ring-white/10' 
                               : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                             }`}
                           >
                             {r}
                           </Link>
                        ))}
                      </div>
                    </div>
                    {stats.length === 0 ? (
                      <p className="text-sm text-zinc-400">Compiling historical insights...</p>
                    ) : (
                      <div className={MONITOR_TABLE.outerWrapper}>
                        <div className={BRAND_TABLE_SURFACE_GRADIENT} />
                        <div className={MONITOR_TABLE.innerScroll}>
                        <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition}`}>
                          <thead>
                            {(() => {
                              const hasEdgeData = stats.some(s => s.edge_hit_avg_ms !== null);
                              const hasOriginData = stats.some(s => s.origin_miss_avg_ms !== null);
                              const showSplitTtfb = hasEdgeData || hasOriginData;

                              return (
                                <>
                                  <tr className={MONITOR_HEADER_CARD.replace('px-5 py-3.5', 'px-3 py-2') + ' bg-zinc-900/50 border-white/5 border-b'}>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Geographic region" position="top-center" direction="top">Region</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Point of presence (PoP) inferred from response headers" position="top-center" direction="top">Served from</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Edge provider identity (explicit header or inferred from response)" position="top-center" direction="top">Served by</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Cache effectiveness percentage" position="top-center" direction="top">Cache</PremiumTooltip>
                                    </th>
                                    {showSplitTtfb ? (
                                      <>
                                        <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                                          <PremiumTooltip content="Time to First Byte served from Edge" position="top-center" direction="top">Edge TTFB</PremiumTooltip>
                                        </th>
                                        <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER_ORIGIN}`}>
                                          <PremiumTooltip content="Time to First Byte served from Origin (Bypass)" position="top-center" direction="top">Origin TTFB</PremiumTooltip>
                                        </th>
                                        <th className={`cs-table-compact-th !text-center border-l border-white/5 ${TH_TTFB_HEADER}`}>
                                          <PremiumTooltip content="Overall weighted average TTFB" position="top-center" direction="top">Avg TTFB</PremiumTooltip>
                                        </th>
                                      </>
                                    ) : (
                                      <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                                        <PremiumTooltip content="Average TTFB" position="top-center" direction="top">Avg TTFB</PremiumTooltip>
                                      </th>
                                    )}

                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Average Network Handshake duration" position="top-center" direction="top">Net</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center whitespace-nowrap">
                                      <PremiumTooltip content="Min and Max TTFB observed over period" position="top-center" direction="top">Min / Max</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Percentage of successful probes" position="top-center" direction="top">Uptime</PremiumTooltip>
                                    </th>
                                  </tr>
                                </>
                              )
                            })()}
                          </thead>
                          <tbody>
                            {(() => {
                              const hasEdgeData = stats.some(st => st.edge_hit_avg_ms !== null);
                              const hasOriginData = stats.some(st => st.origin_miss_avg_ms !== null);
                              const showSplitTtfb = hasEdgeData || hasOriginData;

                              return stats.map((s) => {
                                return (
                                  <tr
                                    key={s.region}
                                    className={MONITOR_TABLE.tbodyRow}
                                  >
                                    <td className="cs-table-compact-td">
                                      <PremiumTooltip content={REGION_DESCRIPTIONS[s.region] ?? s.region} position="top-left">
                                        <span className="font-bold text-zinc-200">
                                          {REGION_LABELS[s.region] ?? s.region}
                                        </span>
                                      </PremiumTooltip>
                                    </td>
                                    <td className="cs-table-compact-td text-center">
                                      <PremiumTooltip content={extractPop(s.common_served_by) ? `PoP code detected: ${extractPop(s.common_served_by)}` : 'Location inferred from monitoring region'} position="top-left">
                                        <span className="cs-pop-tag whitespace-nowrap uppercase">
                                          {s.common_served_by ? (popToCity(extractPop(s.common_served_by) || '') || extractPop(s.common_served_by)) : '—'}
                                        </span>
                                      </PremiumTooltip>
                                    </td>
                                    <td className="cs-table-compact-td text-center">
                                      <PremiumTooltip content={s.common_served_by ? `served_by: ${s.common_served_by}` : 'No edge hint'} position="top-center" direction="top">
                                        <span className="cs-pop-tag max-w-[9rem] truncate">
                                          {resolveCdnLabel(s.common_cdn_provider, s.common_served_by) ?? '—'}
                                        </span>
                                      </PremiumTooltip>
                                    </td>
                                    <td className="cs-table-compact-td text-center">
                                      {s.cache_hit_pct != null ? (
                                        <PremiumTooltip content={`${s.cache_hit_pct}% of requests were served from edge cache`} position="top-center" direction="top">
                                          {Math.round(s.cache_hit_pct) >= 95 ? (
                                            <span className="cs-badge cs-badge-success text-[11px] px-2.5 py-1 min-w-[62px] justify-center">
                                              <Zap className="w-[11px] h-[11px] fill-current" />
                                              {Math.round(s.cache_hit_pct)}%
                                            </span>
                                          ) : Math.round(s.cache_hit_pct) >= 90 ? (
                                            <span className="cs-badge-flat cs-badge-flat-success text-[11px] px-2.5 py-1 min-w-[62px] justify-center font-bold">
                                              {Math.round(s.cache_hit_pct)}%
                                            </span>
                                          ) : Math.round(s.cache_hit_pct) >= 50 ? (
                                            <span className="cs-badge-flat cs-badge-flat-warning text-[11px] px-2.5 py-1 min-w-[62px] justify-center font-bold">
                                              {Math.round(s.cache_hit_pct)}%
                                            </span>
                                          ) : (
                                            <span className="cs-badge-flat cs-badge-flat-danger text-[11px] px-2.5 py-1 min-w-[62px] justify-center font-bold">
                                              {Math.round(s.cache_hit_pct)}%
                                            </span>
                                          )}
                                        </PremiumTooltip>
                                      ) : '—'}
                                    </td>

                                    {showSplitTtfb ? (
                                      <>
                                        <td className={`${edgeTtfbMetricCellClass(s.edge_hit_avg_ms)} !text-[13px] !py-2`}>
                                          <PremiumTooltip content="Avg response time served from CDN Cache" position="top-right" direction="top">{s.edge_hit_avg_ms != null ? `${Math.round(s.edge_hit_avg_ms)}ms` : '—'}</PremiumTooltip>
                                        </td>
                                        <td className={`${originTtfbMetricCellClass(s.origin_miss_avg_ms)} !text-[13px] !py-2`}>
                                          <PremiumTooltip content="Avg response time bypassing cache (Direct from Origin)" position="top-right" direction="top">{s.origin_miss_avg_ms != null ? `${Math.round(s.origin_miss_avg_ms)}ms` : '—'}</PremiumTooltip>
                                        </td>
                                        <td className={`${ttfbMetricCellClass(s.ttfb_avg_ms)} !text-[13px] !py-2 border-l border-white/5`}>
                                          <PremiumTooltip content="Overall weighted average response time for this region" position="top-right" direction="top">{s.ttfb_avg_ms != null ? `${Math.round(s.ttfb_avg_ms)}ms` : '—'}</PremiumTooltip>
                                        </td>
                                      </>
                                    ) : (
                                      <td className={`${ttfbMetricCellClass(s.ttfb_avg_ms)} !text-[13px] !py-2`}>
                                        {s.ttfb_avg_ms != null ? `${Math.round(s.ttfb_avg_ms)}ms` : '—'}
                                      </td>
                                    )}

                                    <td className="cs-table-compact-td-mono text-right relative group/net">
                                      <span className="text-zinc-400 cursor-help border-b border-dashed border-zinc-700/50 hover:border-zinc-500 transition-colors pb-0.5">
                                        {Math.round((s.dns_avg_ms || 0) + (s.tcp_avg_ms || 0) + (s.tls_avg_ms || 0))}<span className="text-[9px] ml-0.5 opacity-50 font-sans">ms</span>
                                      </span>
                                      {/* Glass Tooltip */}
                                      <div className="absolute bottom-full right-0 mb-2 invisible group-hover/net:visible opacity-0 group-hover/net:opacity-100 transition-all duration-200 translate-y-2 group-hover/net:translate-y-0 z-50">
                                        <div className="bg-[#111d32]/95 backdrop-blur-xl border border-white/10 rounded-lg p-2.5 shadow-2xl min-w-[140px] text-left">
                                          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Average Breakdown</p>
                                          <div className="space-y-1.5">
                                            <div className="flex justify-between items-center gap-4">
                                              <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                                                <div className="w-1 h-1 rounded-full bg-purple-500" /> DNS
                                              </span>
                                              <span className="text-[10px] font-mono font-bold text-zinc-300">{Math.round(s.dns_avg_ms || 0)}ms</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-4">
                                              <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                                                <div className="w-1 h-1 rounded-full bg-blue-500" /> TCP
                                              </span>
                                              <span className="text-[10px] font-mono font-bold text-zinc-300">{Math.round(s.tcp_avg_ms || 0)}ms</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-4">
                                              <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                                                <div className="w-1 h-1 rounded-full bg-fuchsia-500" /> TLS
                                              </span>
                                              <span className="text-[10px] font-mono font-bold text-zinc-300">{Math.round(s.tls_avg_ms || 0)}ms</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    <td className="cs-table-compact-td-mono text-right text-zinc-400">
                                      {s.ttfb_min_ms != null ? (
                                        <PremiumTooltip content={`Min: ${Math.round(s.ttfb_min_ms)}ms / Max: ${Math.round(s.ttfb_max_ms || 0)}ms recorded`} position="top-right">
                                          <span className="whitespace-nowrap border-b border-dashed border-zinc-800 hover:border-zinc-600 transition-colors pb-0.5 cursor-help">
                                            {Math.round(s.ttfb_min_ms)}<span className="opacity-30 mx-1">/</span>{Math.round(s.ttfb_max_ms || 0)}<span className="text-[9px] ml-0.5 opacity-50 font-sans">ms</span>
                                          </span>
                                        </PremiumTooltip>
                                      ) : '—'}
                                    </td>
                                    <td className="cs-table-compact-td text-right">
                                      {s.uptime_pct != null ? (
                                        <PremiumTooltip content={`Uptime: ${Math.round(s.uptime_pct)}% of successful probes`} position="top-right" direction="top">
                                          <span className={`cs-badge-flat ${s.uptime_pct >= 99 ? 'cs-badge-flat-success' : s.uptime_pct >= 95 ? 'cs-badge-flat-warning' : 'cs-badge-flat-danger'} font-bold`}>
                                            {Math.round(s.uptime_pct)}%
                                          </span>
                                        </PremiumTooltip>
                                      ) : '—'}
                                    </td>
                                  </tr>
                                )
                              })
                            })()}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    )}
                  </section>

                  {stats.length > 0 && (
                    <section className="space-y-4">
                      <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Performance trends
                      </h2>
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
                <div className="space-y-4">
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

          {activeTab === 'on-demand' && (
            <div>
              <MonitorOnDemandPanel monitorId={monitor.id} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div>
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Monitor settings</h2>
              <MonitorSettingsPanel
                id={monitor.id}
                url={monitor.url}
                name={monitor.name}
                checkIntervalSeconds={monitor.check_interval_seconds}
                auditIntervalSeconds={monitor.audit_interval_seconds}
                notifyEmail={monitor.notify_email}
                notifyEmailEnabled={monitor.notify_email_enabled}
                notifySlackWebhook={monitor.notify_slack_webhook}
                notifySlackEnabled={monitor.notify_slack_enabled}
              />
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
                Security
              </h2>

              {!security && securityByRegion.length === 0 && (
                <p className="text-sm text-zinc-400">No security data yet.</p>
              )}

              {security && securityByRegion.length === 0 && (
                <div id="security-score" className="rounded-2xl border border-border bg-surface p-6 shadow-sm scroll-mt-24">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Security headers</h3>
                      <p className="text-sm text-zinc-500">Latest observed score from aggregate probes. Regional checklist appears once probes include header data.</p>
                    </div>
                    <div className="flex items-baseline gap-1 tabular-nums">
                      <span className="text-2xl font-bold text-zinc-100">{security.score}</span>
                      <span className="text-lg font-medium text-zinc-500">/</span>
                      <span className="text-xl font-semibold text-zinc-400">9</span>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                if (securityByRegion.length === 0) return null

                // Group regions by identical security header signatures
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
                    {mainProfile.headers?.ssl &&
                      (() => {
                        const ssl = mainProfile.headers.ssl
                        const renewalPct = certRenewalPercentLeft(ssl)
                        const totalDays = certTotalDays(ssl)
                        const fpDisp = formatFingerprintDisplay(ssl.fingerprint256)
                        const daysRem = ssl.days_remaining ?? 0
                        const urgent = daysRem < 15

                        return (
                          <section className="space-y-4">
                            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              SSL / TLS Profile
                            </h3>
                            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                              <div className={BRAND_CARD_SURFACE_GRADIENT} />
                              <div className="relative border-b border-border/80 px-6 py-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                        <Lock className="h-3 w-3 shrink-0 text-emerald-500/90" aria-hidden />
                                        Encrypted
                                      </span>
                                      {ssl.protocol ? (
                                        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-200">
                                          {ssl.protocol.replace(/^TLS/i, 'TLS')}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="max-w-xl text-xs leading-relaxed text-zinc-500">
                                      Leaf certificate observed on the TLS handshake for this probe profile. New probes may refresh issuer
                                      metadata.
                                    </p>
                                  </div>
                                  <div
                                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 ${
                                      urgent
                                        ? 'border-red-500/30 bg-red-500/10'
                                        : 'border-emerald-500/25 bg-emerald-500/[0.07]'
                                    }`}
                                  >
                                    <span
                                      className={`h-2 w-2 shrink-0 rounded-full ${urgent ? 'animate-pulse bg-red-400' : 'bg-emerald-400'}`}
                                    />
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Renewal</p>
                                      <p
                                        className={`text-sm font-bold tabular-nums ${
                                          urgent ? 'text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                                        }`}
                                      >
                                        {daysRem} days left
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="relative flex flex-col border-b border-border/60 px-6 py-3 sm:flex-row sm:items-start sm:py-2.5">
                                <div className="min-w-0 flex-1 border-b border-border/50 pb-3 sm:border-b-0 sm:border-r sm:border-border/60 sm:pb-0 sm:pr-5">
                                  <p className="text-[9px] font-bold uppercase tracking-tight text-zinc-500">Certificate identity</p>
                                  <p className="mt-0.5 truncate text-sm font-semibold leading-snug text-zinc-50">
                                    {ssl.subject_cn || monitorHostname || '—'}
                                  </p>
                                  {ssl.subject_o ? (
                                    <p className="mt-0.5 truncate text-[11px] leading-snug text-zinc-500">{ssl.subject_o}</p>
                                  ) : null}
                                </div>
                                <div className="min-w-0 flex-1 pt-3 sm:pt-0 sm:pl-5">
                                  <p className="text-[9px] font-bold uppercase tracking-tight text-zinc-500">Issuing authority</p>
                                  <p className="mt-0.5 truncate text-sm font-semibold leading-snug text-zinc-100">
                                    {ssl.issuer_o || ssl.issuer_cn || ssl.issuer || 'Unknown CA'}
                                  </p>
                                  {ssl.issuer_o && ssl.issuer_cn && ssl.issuer_o !== ssl.issuer_cn ? (
                                    <p className="mt-0.5 truncate text-[11px] leading-snug text-zinc-500">{ssl.issuer_cn}</p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="relative space-y-3 px-6 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">Validity window</p>
                                  {totalDays != null && renewalPct != null ? (
                                    <span className="text-[10px] tabular-nums text-zinc-500">
                                      {totalDays} day cert · {Math.round(renewalPct)}% of lifetime left
                                    </span>
                                  ) : null}
                                </div>
                                {renewalPct != null ? (
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/20 dark:bg-zinc-800">
                                    <div
                                      className={`h-full rounded-full ${urgent ? 'bg-red-500/90' : 'bg-emerald-500/90'}`}
                                      style={{ width: `${renewalPct}%` }}
                                    />
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-zinc-500">
                                  <span>
                                    <span className="text-zinc-400">From</span>{' '}
                                    <span className="font-mono text-zinc-300">{formatCertDate(ssl.valid_from)}</span>
                                  </span>
                                  <span className="hidden text-zinc-600 sm:inline">→</span>
                                  <span>
                                    <span className="text-zinc-400">Until</span>{' '}
                                    <span className="font-mono text-zinc-300">{formatCertDate(ssl.valid_to)}</span>
                                  </span>
                                </div>
                              </div>

                              {fpDisp || ssl.bits != null ? (
                                <div className="relative grid gap-4 border-t border-border/80 px-6 py-5 md:grid-cols-2">
                                  {fpDisp ? (
                                    <div className="space-y-1.5">
                                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                                        <Fingerprint className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                                        SHA-256 fingerprint
                                      </p>
                                      <p className="break-all font-mono text-[10px] leading-relaxed text-zinc-400" title={fpDisp.full}>
                                        {fpDisp.short}
                                      </p>
                                    </div>
                                  ) : null}
                                  {ssl.bits != null ? (
                                    <div className="space-y-1.5">
                                      <p className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">Public key</p>
                                      <p className="font-mono text-xs text-zinc-300">{ssl.bits}-bit public key</p>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </section>
                        )
                      })()}

                    <section id="security-score" className="scroll-mt-24 space-y-4">
                      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm">
                        <div className={BRAND_CARD_SURFACE_GRADIENT} />
                        <div className="relative">
                        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Global Security Profile</h3>
                            <p className="text-sm text-zinc-500">
                              Which security headers were observed on the latest probes. Score is out of nine tracked headers.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                            {security && (
                              <div className="flex items-baseline gap-1 rounded-lg border border-border bg-white/5 px-3 py-2 tabular-nums" title="Headers present out of nine tracked">
                                <span className="text-2xl font-bold text-zinc-100">{security.score}</span>
                                <span className="text-lg font-medium text-zinc-500">/</span>
                                <span className="text-xl font-semibold text-zinc-400">9</span>
                              </div>
                            )}
                            <div className="flex -space-x-2">
                              {mainProfile.regions.map(r => (
                                <div key={r} title={REGION_LABELS[r]} className="flex h-6 w-6 cursor-help items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-[8px] font-bold text-white shadow-sm dark:border-zinc-950">
                                  {r.split('-').map(p => p[0].toUpperCase()).join('')}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

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
                                      <div className="rounded border border-border bg-white/5 p-2 text-wrap dark:bg-zinc-900/40">
                                        <code className="block text-[10px] text-zinc-600 dark:text-zinc-400 break-all font-mono leading-relaxed">
                                          {valStr}
                                        </code>
                                      </div>
                                    )
                                  }
                                  return (
                                    <details className="group">
                                      <summary className="flex items-center gap-1.5 cursor-pointer list-none outline-none">
                                        <div className="min-w-0 flex-1 rounded border border-border bg-white/5 p-2 dark:bg-zinc-900/40">
                                          <code className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono block truncate">
                                            {valStr.slice(0, 100)}...
                                          </code>
                                        </div>
                                        <div className="flex flex-col items-center gap-0.5 px-1">
                                          <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter group-open:hidden">Full</span>
                                          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter hidden group-open:inline">Less</span>
                                        </div>
                                      </summary>
                                      <div className="mt-2 rounded border border-border bg-surface/80 p-2 shadow-inner">
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
                      </div>
                      <p className="text-[10px] text-zinc-400 text-right italic">Consistent across {mainProfile.regions.length} regions. Last verified: {formatDate(mainProfile.sampled_at)}</p>
                    </section>

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
            </section>
          )}

          {activeTab === 'incidents' && (
            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
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

                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
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

                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
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
                <div className="rounded-xl border border-border bg-surface/50 p-4">
                  <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    24h Recurrence Trends
                  </h3>
                  <div className="h-24 w-full flex items-end gap-1 px-1">
                    {(() => {
                      const maxCount = Math.max(...incidentTrends.map(t => t.count), 1)
                      // Fill hourly slots so missing buckets show as zero
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

              <div id="alert-history" className="space-y-4 scroll-mt-24">
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                  <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-tight flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Alert history
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
                  <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck className="w-6 h-6 text-emerald-500" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No alerts detected</h3>
                    <p className="text-xs text-zinc-500 mt-1 max-w-[240px] mx-auto">This monitor is currently healthy and performing within expected baselines.</p>
                  </div>
                ) : (
                  <div className={MONITOR_TABLE.outerWrapperMuted}>
                    <div className={BRAND_TABLE_SURFACE_GRADIENT} />
                    <div className={MONITOR_TABLE.innerScroll}>
                    <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition}`}>
                      <thead>
                        <tr className={MONITOR_TABLE.theadRow}>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Timestamp</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Region</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Event Type</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Metric</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Baseline</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Actual</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((alert) => {
                          const severity = (alert.deviation_factor ?? 0) > 4 ? 'CRITICAL' : (alert.deviation_factor ?? 0) > 2 ? 'WARNING' : 'STATED';
                          const severityColor = severity === 'CRITICAL' ? 'bg-red-500 text-white' : severity === 'WARNING' ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400';

                          return (
                            <tr key={alert.id} className={MONITOR_TABLE.tbodyRow}>
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

