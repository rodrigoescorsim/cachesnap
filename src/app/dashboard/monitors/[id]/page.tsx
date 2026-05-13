import { Fragment } from 'react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import {
  isCacheHit,
  getCacheDisplayLabel,
  CACHE_HIT_STATUSES,
  CACHE_MISS_STATUSES,
  PG_CACHE_CDN_HIT_FILTER,
  pgCacheCdnSamplesSqlExpr,
  pgCacheEdgeHitSamplesSqlExpr,
  pgCacheHitPctSqlExpr,
} from '@/lib/cache-utils'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import { TtfbChart, type ChartPoint } from './ttfb-chart'
import { HourlyPatternChart } from './hourly-pattern-chart'
import { TtfbHeatmap } from './ttfb-heatmap'
import { MonitorHeaderToolbar } from './monitor-header-toolbar'
import { MonitorSettingsPanel } from './monitor-settings-panel'
import { ActiveIncidentsPanel, type ActiveIncident } from './active-incidents-panel'
import { type TrendComparator } from './monitor-edit-form'
import { LiveActivityHeader } from './live-activity-header'
import { RealTimeHub } from '../../real-time-hub'
import { ViewSectionHeader, LiveDot } from '@/components/dashboard/dashboard-ui'
import { extractPop, popToCity, resolveCdnLabel } from '@/lib/edge-helpers'
import { ProbeWaterfall, type WaterfallProbe } from './probe-waterfall'
import { MonitorSidebarRail } from './monitor-sidebar-rail'
import { LiveTable, type LiveProbe } from './live-table'
import { PerformanceTable, type RegionStat } from './performance-table'
import {
  buildViewHref,
  buildMonitorHref,
  type AlertType,
  type MonitorTab,
  type PerformanceView,
  VALID_ALERT_TYPES,
  ALERT_TYPE_LABELS,
  TIMEFRAME_TOOLTIPS,
} from './monitor-href'
import { type Alert } from '@/types/monitor'
import { AlertHistoryTable } from './alert-history-table'
import { TIMING } from './timing-metrics-palette'
import { getRegions } from '@/lib/regions'
import { MONITOR_TTFB, MONITOR_CACHE, getCacheColor, getTtfbColorClass, getTtfbTooltip, getCacheTooltip } from '@/lib/thresholds'
import { VisualGlow } from '../../visual-glow'
import {
  Activity,
  ShieldCheck,
  Lock,
  AlertCircle,
  PlayCircle,
  History,
  CalendarDays,
  AlertTriangle,
  TrendingUp,
  Zap,
  Gauge,
  Fingerprint,
  Settings,
  BarChart3,
  ShieldAlert,
  ScrollText,
  Info,
  type LucideIcon,
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

type LatestProbeRow = LiveProbe

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

interface HourlyPoint {
  hour_of_day: number
  ttfb_avg: number
  ttfb_p95: number | null
  cache_hit_pct: number | null
  sample_count: number
}

interface HeatmapCell {
  dow: number
  hour_of_day: number
  ttfb_avg: number | null
  cache_hit_pct: number | null
  sample_count: number
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


interface SecurityByRegion {
  region: string
  security_headers: SecurityHeaders | null
  server_timing_breakdown: Record<string, number> | null
  served_by: string | null
  cdn_provider: string | null
  sampled_at: Date
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

const VALID_TABS = ['performance', 'on-demand', 'resilience', 'security', 'settings', 'incidents', 'alert-history'] as const satisfies readonly MonitorTab[]

const TAB_LABELS: Record<MonitorTab, string> = {
  performance: 'Performance',
  'on-demand': 'On-demand',
  resilience: 'Resilience',
  security: 'Security',
  settings: 'Settings',
  incidents: 'Incidents',
  'alert-history': 'Alert History',
}

const TAB_ICONS: Record<MonitorTab, LucideIcon> = {
  performance: Activity,
  'on-demand': PlayCircle,
  resilience: TrendingUp,
  security: Lock,
  settings: Settings,
  incidents: AlertCircle,
  'alert-history': ScrollText,
}

const VALID_PERFORMANCE_VIEWS = ['real-time', 'performance', 'trends', 'patterns', 'infrastructure'] as const satisfies readonly PerformanceView[]

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Live',
  performance: 'Performance',
  trends: 'Trends',
  patterns: 'Patterns',
  infrastructure: 'Edge vs Origin',
}

/** Monitor title card — subtle top wash + glass (Vercel-style). Densidade ~tool (menos padding vertical). */
const MONITOR_HEADER_CARD =
  'cs-card cs-card-glass px-5 py-2.5 relative'

/** Status pills in the monitor title bar — consistent shell + interactive hover. */
const MONITOR_HEADER_STATUS_BADGE =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-white/5 px-2.5 py-0 text-[9px] font-bold uppercase tracking-widest transition-colors hover:bg-white/10 text-zinc-300'

/** Active monitor dot — soft mint glow + pulse (“system alive”). */
const MONITOR_HEADER_ACTIVE_DOT =
  'bg-[var(--brand-primary)] [box-shadow:0_0_8px_rgba(34,255,136,0.5)]'


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

const CSP_VOLATILE_SOURCE_RE = /^(?:'nonce-[^']+'|nonce-\S+|'sha(?:256|384|512)-[^']+'|sha(?:256|384|512)-\S+)$/i

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeCspValue(value: string): string {
  const normalizedDirectives = value
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const tokens = part.split(/\s+/).filter(Boolean)
      if (tokens.length === 0) return null
      const [directive, ...sources] = tokens
      const stableSources = sources
        .filter(src => !CSP_VOLATILE_SOURCE_RE.test(src))
        .sort((a, b) => a.localeCompare(b))
      return [directive.toLowerCase(), ...stableSources].join(' ')
    })
    .filter((part): part is string => part !== null)
    .sort((a, b) => a.localeCompare(b))

  return normalizedDirectives.join('; ')
}

function normalizeSecurityHeaderValue(
  key: keyof SecurityHeaders,
  value: SecurityHeaders[keyof SecurityHeaders] | null | undefined
): string | number | null {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return JSON.stringify(value)

  const trimmed = normalizeWhitespace(value)
  if (key === 'csp') return normalizeCspValue(trimmed)
  return trimmed
}

function buildSecurityComparisonProfile(
  headers: SecurityHeaders | null | undefined
): Record<string, string | number | null> {
  const comparable: Record<string, string | number | null> = {}
  for (const { key } of SECURITY_HEADERS_LABELS) {
    comparable[key] = normalizeSecurityHeaderValue(key, headers?.[key])
  }
  return comparable
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
    return { text: '0', tone: 'text-metric-ttfb-fast' }
  }

  if (value <= 2) {
    return { text: `${value}`, tone: 'text-amber-500 font-medium' }
  }

  return { text: `${value}`, tone: 'text-red-500 font-medium' }
}

/** Tooltip copy when the origin/CDN did not send cache status headers (replaces legacy "Hidden"). */
const CACHE_STATUS_NOT_REPORTED_TOOLTIP =
  'Cache status not reported by the server. The origin may not be sending cache headers (CF-Cache-Status, X-Vercel-Cache, etc.).'

type LiveActivityCacheVariant =
  | 'hit'
  | 'miss'
  | 'bypass'
  | 'dynamic'
  | 'not_reported'
  | 'percent_good'
  | 'percent_warn'
  | 'dash'

function cacheDisplay(
  status: string | null,
  hitPct: number | null
): { text: string; title: string; variant: LiveActivityCacheVariant } {
  const normalizedStatus = status?.toUpperCase() ?? null

  if (isCacheHit(normalizedStatus)) {
    return {
      text: hitPct != null ? `${formatPct(hitPct)}%` : normalizedStatus ?? 'HIT',
      variant: 'hit',
      title: 'Cache hit observed (including STALE/REVALIDATED)',
    }
  }

  if (normalizedStatus === 'MISS') {
    return {
      text: hitPct != null ? `${formatPct(hitPct)}%` : 'MISS',
      variant: 'miss',
      title: 'Cache miss observed',
    }
  }

  if (normalizedStatus === 'DYNAMIC') {
    return {
      text: 'Dynamic',
      variant: 'dynamic',
      title: 'Dynamic response — not a static edge cache hit (e.g. Vercel DYNAMIC).',
    }
  }

  if (normalizedStatus === 'BYPASS') {
    return {
      text: 'Bypass',
      variant: 'bypass',
      title: 'Cache bypass — the edge did not serve this from cache.',
    }
  }

  // "Hidden" → "Not Reported": missing headers is normal for many origins; neutral slate reads as informational, not broken.
  if (normalizedStatus === 'HIDDEN') {
    return {
      text: 'Not Reported',
      variant: 'not_reported',
      title: CACHE_STATUS_NOT_REPORTED_TOOLTIP,
    }
  }

  if (hitPct === 0 || normalizedStatus === null) {
    return {
      text: 'Not Reported',
      variant: 'not_reported',
      title: CACHE_STATUS_NOT_REPORTED_TOOLTIP,
    }
  }

  if (hitPct != null) {
    return {
      text: `${formatPct(hitPct)}%`,
      variant: hitPct > 70 ? 'percent_good' : 'percent_warn',
      title: 'Observed from response headers',
    }
  }

  return {
    text: '—',
    variant: 'dash',
    title: 'No cache status in this response',
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
  if (pct <= -5) return 'text-metric-ttfb-fast'   // faster — good
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

const AGE_RECENT_MAX_S = 3600  // ≤1h — still fresh at the edge
const AGE_WARNING_MAX_S = 86_400 // >1h up to 24h — elevated but not alarming

function ageBadgeVisual(ageSeconds: number): { className: string; tierHint: string } {
  if (ageSeconds <= AGE_RECENT_MAX_S) {
    return {
      className: 'cs-badge-muted',
      tierHint: 'Cache age within expected range.',
    }
  }
  if (ageSeconds <= AGE_WARNING_MAX_S) {
    return {
      className: 'cs-badge-warning',
      tierHint: 'Cached content is older than expected.',
    }
  }
  return {
    className: 'cs-badge-danger',
    tierHint: 'Cached content is older than expected.',
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
  if (value == null || value <= 0) return '—'
  return `${Math.round(value)}ms`
}

import { EdgeVsOrigin } from './edge-vs-origin'
import { AdvisorCard } from '@/components/advisor/advisor-card'
import { deriveMonitorDetailLiveAdvisor, deriveMonitorPerformancePeriodAdvisor, deriveMonitorTrendsAdvisor, deriveMonitorPatternsAdvisor, deriveMonitorSecurityAdvisor } from '@/components/advisor/advisor-card.helpers'


export default async function MonitorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string | string[]; tab?: string | string[]; view?: string | string[]; alert_type?: string | string[]; alerts_limit?: string | string[] }>
}) {
  const user = await getSession()
  if (!user) return null

  const { id } = await params
  const rawSearchParams = await searchParams
  const rangeValue = readFirst(rawSearchParams.range)
  const tabValue = readFirst(rawSearchParams.tab)
  const viewValue = readFirst(rawSearchParams.view)
  const alertTypeValue = readFirst(rawSearchParams.alert_type)

  const range = rangeValue === '1h' ? '1h'
    : rangeValue === '4h' ? '4h'
      : rangeValue === '7d' ? '7d'
        : rangeValue === '30d' ? '30d'
          : rangeValue === '90d' ? '90d'
            : '24h'
  const dbInterval = range === '1h' ? '1 hour'
    : range === '4h' ? '4 hours'
      : range === '7d' ? '7 days'
        : range === '30d' ? '30 days'
          : range === '90d' ? '90 days'
            : '24 hours'
  const bucketSize = range === '1h' ? '5 minutes'
    : range === '4h' ? '15 minutes'
      : range === '7d' ? '6 hours'
        : range === '30d' ? '1 day'
          : range === '90d' ? '3 days'
            : '30 minutes'
  const activeTab = normalizeTab(tabValue)
  const activeView: PerformanceView = activeTab === 'performance' ? normalizeView(viewValue) : 'real-time'
  const filteredAlertType =
    activeTab === 'alert-history' ? normalizeAlertType(alertTypeValue) : null

  const [monitor] = await sql<{
    id: string; url: string; name: string | null; is_active: boolean; check_interval_seconds: number; audit_interval_seconds: number;
    notify_email: string | null; notify_email_enabled: boolean;
    notify_slack_webhook: string | null; notify_slack_enabled: boolean;
    alert_threshold_ms: number; alert_threshold_hit_ms: number; alert_sensitivity: number;
    alert_down_enabled: boolean; alert_ttfb_enabled: boolean; alert_ttfb_anomaly_enabled: boolean;
    alert_anycast_enabled: boolean; alert_cache_age_enabled: boolean; alert_cache_age_threshold_hours: number;
    alert_cache_hit_enabled: boolean; alert_cache_hit_threshold_pct: number; cache_hit_critical_pct: number;
    alert_cache_hit_trend_enabled: boolean; alert_cache_hit_trend_threshold_pp: number; alert_cache_hit_trend_comparators: string[];
    alert_ttfb_trend_enabled: boolean; alert_ttfb_trend_threshold_pct: number; alert_ttfb_trend_comparators: string[];
    alert_ttfb_trend_direction: string;
    alert_cache_hit_trend_global_enabled: boolean; alert_cache_hit_trend_global_threshold_pp: number;
    alert_ttfb_trend_global_enabled: boolean; alert_ttfb_trend_global_threshold_pct: number;
  }[]>`
    SELECT id, url, name, is_active, check_interval_seconds, audit_interval_seconds,
           notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
           alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity,
           alert_down_enabled, alert_ttfb_enabled, alert_ttfb_anomaly_enabled,
           alert_anycast_enabled, alert_cache_age_enabled, alert_cache_age_threshold_hours,
           alert_cache_hit_enabled, alert_cache_hit_threshold_pct, cache_hit_critical_pct,
           alert_cache_hit_trend_enabled, alert_cache_hit_trend_threshold_pp, alert_cache_hit_trend_comparators,
           alert_ttfb_trend_enabled, alert_ttfb_trend_threshold_pct, alert_ttfb_trend_comparators,
           alert_ttfb_trend_direction,
           alert_cache_hit_trend_global_enabled, alert_cache_hit_trend_global_threshold_pp,
           alert_ttfb_trend_global_enabled, alert_ttfb_trend_global_threshold_pct
    FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) notFound()

  const regionRows = await getRegions()
  const regionLabels = Object.fromEntries(regionRows.map(r => [r.id, r.label]))
  const regionDescriptions = Object.fromEntries(regionRows.map(r => [r.id, r.description]))
  const regionMeta = Object.fromEntries(regionRows.map(r => [r.id, { label: r.label, color: r.color }]))

  const stats = await sql<RegionStat[]>`
    SELECT
      region,
      COUNT(*)::int                              AS probe_count,
      ROUND(AVG(ttfb_ms)::numeric, 0)::int            AS ttfb_avg_ms,
      ROUND(AVG(ttfb_ms) FILTER (WHERE ${sql.unsafe(PG_CACHE_CDN_HIT_FILTER)})::numeric, 0)::int AS edge_hit_avg_ms,
      ROUND(AVG(ttfb_ms) FILTER (WHERE (cache_status ILIKE '%MISS%' OR cache_status = 'DYNAMIC' OR cache_status = 'BYPASS' OR cache_status = 'EXPIRED' OR cache_status = 'PASS' OR cache_status = 'NONE' OR cache_status = 'ERROR' OR cache_status = 'UNCALCULABLE') AND cache_status != 'HIDDEN')::numeric, 0)::int AS origin_miss_avg_ms,
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
      MODE() WITHIN GROUP (ORDER BY status_code) AS common_status_code,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS error_count,
      ${sql.unsafe(pgCacheEdgeHitSamplesSqlExpr())} AS cache_edge_hit_samples,
      ${sql.unsafe(pgCacheCdnSamplesSqlExpr())} AS cache_cdn_samples,
      ${sql.unsafe(pgCacheHitPctSqlExpr({ decimals: 1 }))} AS cache_hit_pct,
      ROUND(
        (100.0 * COUNT(*) FILTER (WHERE error IS NULL AND status_code < 500)
               / NULLIF(COUNT(*), 0))::numeric, 1
      )                                          AS uptime_pct,
      MAX(age_s)::int                            AS max_age_s,
      MAX(time)                                  AS last_probe_at
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - CAST(${dbInterval} AS interval)
    GROUP BY region ORDER BY region
  `

  const prevStats = await sql<{ ttfb_avg_ms: number; cache_hit_pct: number | null; cache_cdn_samples: number; uptime_pct: number }[]>`
    SELECT
      ROUND(AVG(ttfb_ms)::numeric, 0)::int            AS ttfb_avg_ms,
      ${sql.unsafe(pgCacheCdnSamplesSqlExpr())} AS cache_cdn_samples,
      ${sql.unsafe(pgCacheHitPctSqlExpr({ decimals: 1, cast: 'float' }))} AS cache_hit_pct,
      ROUND(
        (100.0 * COUNT(*) FILTER (WHERE error IS NULL AND status_code < 500) / NULLIF(COUNT(*), 0))::numeric,
        1
      )::float AS uptime_pct,
      MODE() WITHIN GROUP (ORDER BY status_code) AS common_status_code
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
      error,
      age_s AS max_age_s,
      time AS last_probe_at,
      probe_version,
      server_timing_breakdown
    FROM probe_results p1
    WHERE monitor_id = ${id}
    ORDER BY region, time DESC
  `

  const loadIncidentSummary = activeTab === 'incidents'
  const loadAlerts = activeTab === 'incidents' || activeTab === 'alert-history'

  const incidentTrends = loadIncidentSummary
    ? await sql<{ bucket: Date; count: number }[]>`
    SELECT time_bucket('1h', created_at) AS bucket, COUNT(*)::int
    FROM alerts
    WHERE monitor_id = ${id} AND created_at > NOW() - CAST(${dbInterval} AS interval)
    GROUP BY bucket ORDER BY bucket ASC
  `
    : []

  const alertsLimit = Math.min(Math.max(Number(readFirst(rawSearchParams.alerts_limit) || 100), 100), 1000)

  const alerts = loadAlerts
    ? filteredAlertType
      ? await sql<Alert[]>`
        SELECT id, region, alert_type, metric, baseline_ms, actual_ms, deviation_factor, diagnosis, action,
               delta_pct, comparator, scope, created_at
        FROM alerts
        WHERE monitor_id = ${id} AND alert_type = ${filteredAlertType}
        ORDER BY created_at DESC
        LIMIT ${alertsLimit}
      `
      : await sql<Alert[]>`
        SELECT id, region, alert_type, metric, baseline_ms, actual_ms, deviation_factor, diagnosis, action,
               delta_pct, comparator, scope, created_at
        FROM alerts
        WHERE monitor_id = ${id}
        ORDER BY created_at DESC
        LIMIT ${alertsLimit}
      `
    : []

  const hasNextAlertsPage = loadAlerts && alerts.length >= alertsLimit

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

  const chartRaw = await sql<{ bucket: Date; region: string; ttfb_avg: number; ttfb_p95: number | null; dns_avg: number | null; tcp_avg: number | null; tls_avg: number | null; cache_hit_pct: number | null }[]>`
    SELECT
      time_bucket(CAST(${bucketSize} AS interval), time) AS bucket,
      region,
      ROUND(AVG(ttfb_ms)::numeric, 0)                                          AS ttfb_avg,
      ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)::numeric, 0
      )::int                                                                    AS ttfb_p95,
      ROUND(AVG(dns_ms)::numeric, 0)                                           AS dns_avg,
      ROUND(AVG(tcp_ms)::numeric, 0)                                           AS tcp_avg,
      ROUND(AVG(tls_ms)::numeric, 0)                                           AS tls_avg,
      ${sql.unsafe(pgCacheHitPctSqlExpr({ decimals: 0 }))}                      AS cache_hit_pct
    FROM probe_results
    WHERE monitor_id = ${id}
      AND time > NOW() - CAST(${dbInterval} AS interval)
      AND ttfb_ms IS NOT NULL
    GROUP BY bucket, region
    ORDER BY bucket ASC, region ASC
  `

  const hourlyBypass = (activeView === 'infrastructure')
    ? await sql<{
      hour: Date;
      region: string;
      edge_ttfb: number;
      origin_ttfb: number;
      edge_hit_count: number;
      origin_miss_count: number;
      sample_count: number;
      savings: number;
      edge_cache_status: string | null;
      origin_cache_status: string | null
    }[]>`
        WITH combined AS (
          -- 1. Dedicated Audit/Bypass probes (Both metrics in one row)
          SELECT 
            time, region, 
            edge_ttfb_ms, origin_ttfb_ms, 
            edge_cache_status, origin_cache_status
          FROM audit_results
          WHERE monitor_id = ${id} AND time > NOW() - CAST(${dbInterval} AS interval)

          UNION ALL

          -- 2. Organic HITs from regular probes (Contributes to Edge average)
          SELECT 
            time, region, 
            ttfb_ms AS edge_ttfb_ms, NULL::FLOAT AS origin_ttfb_ms, 
            cache_status AS edge_cache_status, NULL AS origin_cache_status
          FROM probe_results
          WHERE monitor_id = ${id} AND time > NOW() - CAST(${dbInterval} AS interval)
            AND ttfb_ms IS NOT NULL
            AND (
              UPPER(cache_status) LIKE '%HIT%' OR 
              UPPER(cache_status) LIKE '%STALE%' OR 
              UPPER(cache_status) LIKE '%REVALIDATE%' OR 
              UPPER(cache_status) LIKE '%UPDATING%'
            )

          UNION ALL

          -- 3. Organic MISSes/Bypasses from regular probes (Contributes to Origin average)
          SELECT 
            time, region, 
            NULL::FLOAT AS edge_ttfb_ms, ttfb_ms AS origin_ttfb_ms, 
            NULL AS edge_cache_status, cache_status AS origin_cache_status
          FROM probe_results
          WHERE monitor_id = ${id} AND time > NOW() - CAST(${dbInterval} AS interval)
            AND ttfb_ms IS NOT NULL
            AND (
              UPPER(cache_status) LIKE '%MISS%' OR 
              UPPER(cache_status) LIKE '%EXPIRED%' OR 
              UPPER(cache_status) LIKE '%ERROR%' OR
              UPPER(cache_status) LIKE '%BYPASS%' OR
              UPPER(cache_status) LIKE '%DYNAMIC%' OR
              UPPER(cache_status) LIKE '%PASS%' OR
              UPPER(cache_status) LIKE '%NONE%' OR
              UPPER(cache_status) LIKE '%UNCALCULABLE%'
            )
        )
        SELECT
          date_trunc('hour', time) AS hour,
          region,
          AVG(edge_ttfb_ms) AS edge_ttfb,
          AVG(origin_ttfb_ms) AS origin_ttfb,
          COUNT(edge_ttfb_ms) AS edge_hit_count,
          COUNT(origin_ttfb_ms) AS origin_miss_count,
          COUNT(*) AS sample_count,
          COALESCE(AVG(origin_ttfb_ms - edge_ttfb_ms), 0) AS savings,
          MODE() WITHIN GROUP (ORDER BY edge_cache_status) AS edge_cache_status,
          MODE() WITHIN GROUP (ORDER BY origin_cache_status) AS origin_cache_status
        FROM combined
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2 ASC
      `
    : []

  // Readiness state for Edge vs Origin (migration 026)
  type ReadinessRow = {
    state: string; reason: string | null;
    comparable_pairs: number; comparable_regions: number;
    edge_hit_ratio: number; updated_at: Date | null;
  }
  const auditReadiness: ReadinessRow | null = activeView === 'infrastructure'
    ? ((await sql<ReadinessRow[]>`
        SELECT
          audit_readiness_state              AS state,
          audit_readiness_reason             AS reason,
          audit_readiness_comparable_pairs   AS comparable_pairs,
          audit_readiness_comparable_regions AS comparable_regions,
          audit_readiness_edge_hit_ratio     AS edge_hit_ratio,
          audit_readiness_updated_at         AS updated_at
        FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
      `.catch(() => []))[0] ?? null)
    : null

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
      AND (ttfb_avg - prev_avg) > 150
    ORDER BY spike_ms DESC
    LIMIT 5
  `

  // Hourly pattern and heatmap queries
  const hourlyPattern = await sql<HourlyPoint[]>`
        SELECT
          EXTRACT(HOUR FROM time)::int                                           AS hour_of_day,
          ROUND(AVG(ttfb_ms)::numeric, 0)::int                                   AS ttfb_avg,
          ROUND(
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)::numeric, 0
          )::int                                                                  AS ttfb_p95,
          ${sql.unsafe(pgCacheHitPctSqlExpr({ decimals: 0, cast: 'int' }))}        AS cache_hit_pct,
          COUNT(*)::int                                                           AS sample_count
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - CAST(${dbInterval} AS interval)
          AND ttfb_ms IS NOT NULL
        GROUP BY hour_of_day
        ORDER BY hour_of_day
      `
  const heatmapRows = await sql<HeatmapCell[]>`
        SELECT
          EXTRACT(DOW FROM time)::int                                            AS dow,
          EXTRACT(HOUR FROM time)::int                                           AS hour_of_day,
          ROUND(AVG(ttfb_ms)::numeric, 0)::int                                   AS ttfb_avg,
          ${sql.unsafe(pgCacheHitPctSqlExpr({ decimals: 0, cast: 'int' }))}        AS cache_hit_pct,
          COUNT(*)::int                                                           AS sample_count
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - CAST(${dbInterval} AS interval)
          AND ttfb_ms IS NOT NULL
        GROUP BY dow, hour_of_day
        ORDER BY dow, hour_of_day
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

  const activeIncidents = await sql<ActiveIncident[]>`
    SELECT
      alert_incidents.id::text,
      alert_incidents.alert_type,
      alert_incidents.severity,
      alert_incidents.affected_regions,
      alert_incidents.opened_at,
      alert_incidents.last_notified_at,
      alert_incidents.notification_count,
      COUNT(a.id)::int AS alert_events_count,
      COUNT(a.id) FILTER (WHERE a.notified_email OR a.notified_slack)::int AS delivered_notification_count,
      COUNT(a.id) FILTER (WHERE NOT a.notified_email AND NOT a.notified_slack)::int AS failed_notification_count,
      alert_incidents.snoozed_until,
      alert_incidents.last_actual,
      alert_incidents.last_threshold,
      EXTRACT(EPOCH FROM (NOW() - alert_incidents.opened_at))::float * 1000 AS duration_ms,
      latest.diagnosis,
      latest.action,
      latest.delta_pct,
      latest.comparator,
      latest.deviation_factor
    FROM alert_incidents
    LEFT JOIN alerts a ON a.incident_id = alert_incidents.id
    LEFT JOIN LATERAL (
      SELECT diagnosis, action, delta_pct, comparator, deviation_factor
      FROM alerts
      WHERE alerts.incident_id = alert_incidents.id
      ORDER BY alerts.created_at DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE alert_incidents.monitor_id = ${id} AND alert_incidents.resolved_at IS NULL
    GROUP BY alert_incidents.id, latest.diagnosis, latest.action, latest.delta_pct, latest.comparator, latest.deviation_factor
    ORDER BY alert_incidents.opened_at DESC
  `

  const monitorHostname = safeHostname(monitor.url)

  const cacheStatsByRegion = new Map(stats.map(row => [row.region, row]))
  const cacheRegions = [...new Set(stats.map(row => row.region))].sort()
  const hasBypassComparison = stats.some(row => row.bypass_ttfb_avg_ms != null)

  const chartPoints: ChartPoint[] = chartRaw.map(row => ({
    bucket: row.bucket.toISOString(),
    region: row.region,
    ttfb_avg: Number(row.ttfb_avg),
    ttfb_p95: row.ttfb_p95 != null ? Number(row.ttfb_p95) : null,
    dns_avg: row.dns_avg != null ? Number(row.dns_avg) : null,
    tcp_avg: row.tcp_avg != null ? Number(row.tcp_avg) : null,
    tls_avg: row.tls_avg != null ? Number(row.tls_avg) : null,
    cache_hit_pct: row.cache_hit_pct != null ? Number(row.cache_hit_pct) : null,
  }))

  const monitorDisplayName = monitor.name ?? monitorHostname ?? monitor.url
  const totalProbes = stats.reduce((sum, s) => sum + s.probe_count, 0)

  // Distinguish "truly new monitor" from "monitor went offline".
  // latestProbes comes from DISTINCT ON (region) without time filter — if it has rows,
  // the monitor has historical data even when the current range (stats) is empty.
  const hasAnyHistoricalProbes = latestProbes.length > 0
  const isCollecting = totalProbes < 3 && !hasAnyHistoricalProbes

  // Detect outage state from the latest probe per region.
  // Must be computed before isOffline so we can suppress the "Offline" banner
  // when the site is actively failing (distinct from "sensor has no data").
  const errorLatestProbes = latestProbes.filter(p => p.error && p.error !== '')
  const isDown = monitor.is_active && latestProbes.length > 0 && errorLatestProbes.length >= latestProbes.length
  const isDegraded = monitor.is_active && errorLatestProbes.length > 0 && !isDown

  // Monitor infrastructure offline: has historical probes but none in the current range.
  // Suppressed when isDown/isDegraded are active — those banners are more specific.
  const isOffline = totalProbes < 3 && hasAnyHistoricalProbes && !isDown && !isDegraded

  // Determine sync freshness: latest probe timestamp vs now
  const nowMs = Date.now()
  const ONE_HOUR_MS = 60 * 60 * 1000
  /** Check if a probe timestamp is stale (>1h old or from a previous calendar day). */
  function probeSyncStatus(probeAt: Date | null): 'live' | 'stale' | 'offline' {
    if (!probeAt) return 'offline'
    const probeMs = new Date(probeAt).getTime()
    const diffMs = nowMs - probeMs
    const probeDate = new Date(probeAt)
    const todayDate = new Date()
    const isDifferentDay =
      probeDate.getUTCFullYear() !== todayDate.getUTCFullYear() ||
      probeDate.getUTCMonth() !== todayDate.getUTCMonth() ||
      probeDate.getUTCDate() !== todayDate.getUTCDate()
    if (isDifferentDay) return 'offline'
    if (diffMs > ONE_HOUR_MS) return 'stale'
    return 'live'
  }

  // Global sync status: worst status across all latest probes
  const globalSyncStatus = latestProbes.length > 0
    ? latestProbes.reduce<'live' | 'stale' | 'offline'>((worst, p) => {
      const s = probeSyncStatus(p.last_probe_at)
      if (s === 'offline') return 'offline'
      if (s === 'stale' && worst !== 'offline') return 'stale'
      return worst
    }, 'live')
    : 'offline'

  // LIVE TAB AGGREGATES (Based on latest probes)
  const validLiveTtfb = latestProbes.filter(p => p.ttfb_ms !== null);
  const liveAvgTtfb = validLiveTtfb.length > 0
    ? Math.round(validLiveTtfb.reduce((acc, p) => acc + (p.ttfb_ms || 0), 0) / validLiveTtfb.length)
    : 0;

  // Only count cacheable traffic (HIT or MISS categories) in the denominator.
  // BYPASS/DYNAMIC/NO HEADER are intentional and must not dilute the cache efficiency rate.
  const liveHitProbes = latestProbes.filter(p => isCacheHit(p.common_cache_status?.toUpperCase() ?? null));
  const liveCacheableProbes = latestProbes.filter(p => {
    const label = getCacheDisplayLabel(p.common_cache_status);
    return CACHE_HIT_STATUSES.includes(label) || CACHE_MISS_STATUSES.includes(label);
  });
  const liveHitCount = liveHitProbes.length;
  const liveGlobalHitRate = liveCacheableProbes.length > 0
    ? Math.round((liveHitCount / liveCacheableProbes.length) * 100)
    : 0;
  // True when all live probes are BYPASS/DYNAMIC — no cacheable traffic at all
  const liveIsFullBypass = latestProbes.length > 0 && liveCacheableProbes.length === 0;

  const isLiveGlobalDynamic = (liveGlobalHitRate === 0 || liveIsFullBypass) && latestProbes.length > 0

  const liveDominantStatusLabel = (() => {
    if (liveGlobalHitRate > 0 || latestProbes.length === 0) return null
    const counts: Record<string, number> = {}
    latestProbes.forEach(p => {
      const label = getCacheDisplayLabel(p.common_cache_status)
      counts[label] = (counts[label] || 0) + 1
    })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? sorted[0][0] : 'NO HEADER'
  })()

  // AGGREGATE CALCULATIONS FOR SUMMARY CARDS
  const avgTtfb = stats.length > 0
    ? Math.round(stats.reduce((acc, s) => acc + Number(s.ttfb_avg_ms || 0), 0) / stats.length)
    : 0;

  const periodCacheHitSum = stats.reduce((acc, s) => acc + Number(s.cache_edge_hit_samples ?? 0), 0)
  const periodCacheCdnSum = stats.reduce((acc, s) => acc + Number(s.cache_cdn_samples ?? 0), 0)
  const globalHitRate =
    periodCacheCdnSum > 0 ? Math.round((periodCacheHitSum / periodCacheCdnSum) * 100) : 0

  const isHistoricalView = activeTab === 'performance' && activeView !== 'real-time';
  const currentGlobalTtfb = isHistoricalView ? avgTtfb : liveAvgTtfb;
  const currentGlobalHitRate = isHistoricalView ? globalHitRate : liveGlobalHitRate;

  // Unified WAF detection for the global header to ensure consistency across views
  // Threshold: at least 2 regions blocked (or 1 if only 1 region is monitored) to avoid single-region flukes
  const wafHistoricalCount = stats.filter(s => Number(s.common_status_code) == 401 || Number(s.common_status_code) == 403).length;
  const wafLiveCount = latestProbes.filter(p => Number(p.status_code) == 401 || Number(p.status_code) == 403).length;

  const hasHistoricalWaf = wafHistoricalCount >= Math.min(2, stats.filter(s => Number(s.probe_count) > 0).length);
  const hasLiveWaf = wafLiveCount >= Math.min(2, latestProbes.length);
  const isCurrentlyWafBlocked = hasHistoricalWaf || hasLiveWaf;

  const isGlobalDynamic = isHistoricalView
    ? (periodCacheCdnSum === 0 && stats.some(s => Number(s.probe_count) > 0))
    : isLiveGlobalDynamic

  // Find current dominant status from Live data to help label historical 0%
  const liveDominantStatus = (() => {
    if (latestProbes.length === 0) return null
    const counts: Record<string, number> = {}
    latestProbes.forEach(p => {
      const label = getCacheDisplayLabel(p.common_cache_status)
      counts[label] = (counts[label] || 0) + 1
    })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? sorted[0][0] : null
  })()

  // Find dominant status for label when 0%
  const dominantStatusLabel = (() => {
    if (globalHitRate > 0) return null
    // If we have a clear live status (like DYNAMIC or NO HEADER), prioritize it over historical MISS
    if (liveDominantStatus && (liveDominantStatus === 'DYNAMIC' || liveDominantStatus === 'BYPASS' || liveDominantStatus === 'NO HEADER')) {
      return liveDominantStatus
    }
    const counts: Record<string, number> = {}
    stats.forEach(s => {
      const label = getCacheDisplayLabel(s.common_cache_status)
      counts[label] = (counts[label] || 0) + 1
    })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? sorted[0][0] : 'NO HEADER'
  })()

  const validUptimeStats = stats.filter(s => typeof s.uptime_pct === 'number');
  const globalUptime = validUptimeStats.length > 0
    ? validUptimeStats.reduce((acc, s) => acc + Number(s.uptime_pct || 0), 0) / validUptimeStats.length
    : 100;

  // Global resilience score: Uptime baseline minus performance penalties (latência e cache)
  // Alinhado com as fórmulas de monitorHealthScore em monitor.ts
  let computedHealth = globalUptime
  if (avgTtfb >= MONITOR_TTFB.FAST) {
    computedHealth -= Math.min(55, Math.round((avgTtfb - MONITOR_TTFB.FAST) * 0.4))
  }
  if (periodCacheCdnSum > 0 && globalHitRate <= MONITOR_CACHE.GOOD) {
    computedHealth -= Math.round((MONITOR_CACHE.GOOD - globalHitRate) * 1.2)
  }
  const healthScore = Math.max(0, Math.min(100, Math.round(computedHealth)));

  // PREVIOUS PERIOD TOTALS FOR TRENDS
  const hasHistory = prevStats.length > 0 && prevStats[0].ttfb_avg_ms !== null;
  const prevData = hasHistory ? prevStats[0] : null;

  const prevAvgTtfb = prevData ? Number(prevData.ttfb_avg_ms || 0) : 0;
  const prevPeriodCacheCdnSum = prevData ? Number(prevData.cache_cdn_samples ?? 0) : 0
  const prevGlobalHitRate =
    prevData && prevData.cache_hit_pct != null ? Math.round(Number(prevData.cache_hit_pct)) : 0
  const prevGlobalUptime = prevData ? Number(prevData.uptime_pct || 100) : 100;
  let prevComputedHealth = prevGlobalUptime
  if (prevAvgTtfb >= MONITOR_TTFB.FAST) {
    prevComputedHealth -= Math.min(55, Math.round((prevAvgTtfb - MONITOR_TTFB.FAST) * 0.4))
  }
  if (prevPeriodCacheCdnSum > 0 && prevGlobalHitRate <= MONITOR_CACHE.GOOD) {
    prevComputedHealth -= Math.round((MONITOR_CACHE.GOOD - prevGlobalHitRate) * 1.2)
  }
  const prevHealthScore = Math.max(0, Math.min(100, Math.round(prevComputedHealth)));

  const healthDelta = hasHistory ? healthScore - prevHealthScore : 0;
  const ttfbDelta = hasHistory ? avgTtfb - prevAvgTtfb : 0;
  const cacheDelta =
    hasHistory && prevData?.cache_hit_pct != null && periodCacheCdnSum > 0 && prevPeriodCacheCdnSum > 0
      ? globalHitRate - prevGlobalHitRate
      : 0;

  // ADVISOR INPUTS
  const slowLiveRegionCount = validLiveTtfb.filter(p => {
    const limit = isCacheHit(p.common_cache_status) ? monitor.alert_threshold_hit_ms : monitor.alert_threshold_ms
    return (p.ttfb_ms ?? 0) > limit
  }).length
  const slowLiveRegionLabels = validLiveTtfb
    .filter(p => {
      const limit = isCacheHit(p.common_cache_status) ? monitor.alert_threshold_hit_ms : monitor.alert_threshold_ms
      return (p.ttfb_ms ?? 0) > limit
    })
    .map(p => regionLabels[p.region] ?? p.region)
  const liveVsGlobalRows = liveAvgTtfb > 0
    ? validLiveTtfb.map((p) => {
      const pct = Math.round((((p.ttfb_ms ?? 0) - liveAvgTtfb) / liveAvgTtfb) * 100)
      return { label: regionLabels[p.region] ?? p.region, deltaPct: pct }
    })
    : []
  const slowestVsGlobalRegion = liveVsGlobalRows.length > 0
    ? [...liveVsGlobalRows].sort((a, b) => b.deltaPct - a.deltaPct)[0]
    : null
  const fastestVsGlobalRegion = liveVsGlobalRows.length > 0
    ? [...liveVsGlobalRows].sort((a, b) => a.deltaPct - b.deltaPct)[0]
    : null
  const liveVsPeriodPct = avgTtfb > 0 ? Math.round(((liveAvgTtfb - avgTtfb) / avgTtfb) * 100) : 0
  const worstWeekTrendRegion = weekTrend.length > 0 ? weekTrend[0] : null
  const liveAdvisorState = deriveMonitorDetailLiveAdvisor({
    monitorId: monitor.id,
    url: monitor.url,
    liveAvgTtfb,
    periodAvgTtfb: avgTtfb,
    liveGlobalHitRate,
    hasLiveCacheData: liveCacheableProbes.length > 0,
    liveDominantStatus,
    liveAvgEdgeMs: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.edge_ms || 0), 0) / latestProbes.length),
    liveAvgOriginMs: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.origin_ms || 0), 0) / latestProbes.length),
    errorRegionCount: errorLatestProbes.length,
    slowRegionCount: slowLiveRegionCount,
    slowRegionLabels: slowLiveRegionLabels,
    slowestVsGlobalRegion,
    fastestVsGlobalRegion,
    totalRegionCount: latestProbes.length,
    ttfbVsPeriodPct: liveVsPeriodPct,
    isDown,
    isDegraded,
    isOffline,
    lastErrorMessage: errorLatestProbes[0]?.error,
    thresholdMs: monitor.alert_threshold_ms,
    thresholdHitMs: monitor.alert_threshold_hit_ms,
    cacheWarnPct: monitor.alert_cache_hit_threshold_pct,
    cacheCriticalPct: monitor.cache_hit_critical_pct,
  })
  const slowHistoricalRegions = stats.filter(s => {
    const limit = isCacheHit(s.common_cache_status) ? monitor.alert_threshold_hit_ms : monitor.alert_threshold_ms
    return (s.ttfb_avg_ms || 0) > limit
  }).length
  const slowHistoricalRegionLabels = stats
    .filter(s => {
      const limit = isCacheHit(s.common_cache_status) ? monitor.alert_threshold_hit_ms : monitor.alert_threshold_ms
      return (s.ttfb_avg_ms || 0) > limit
    })
    .map(s => regionLabels[s.region] ?? s.region)
  const performanceAdvisorState = deriveMonitorPerformancePeriodAdvisor({
    monitorId: monitor.id,
    url: monitor.url,
    range,
    avgTtfb,
    prevAvgTtfb,
    globalHitRate,
    prevGlobalHitRate,
    periodCacheCdnSamples: periodCacheCdnSum,
    prevPeriodCacheCdnSamples: prevPeriodCacheCdnSum,
    hasHistory,
    slowRegionCount: slowHistoricalRegions,
    slowRegionLabels: slowHistoricalRegionLabels,
    isDown,
    isDegraded,
    isOffline,
    errorCount: errorLatestProbes.length,
    totalRegionCount: latestProbes.length,
    lastErrorMessage: errorLatestProbes[0]?.error,
    thresholdMs: monitor.alert_threshold_ms,
    thresholdHitMs: monitor.alert_threshold_hit_ms,
    cacheWarnPct: monitor.alert_cache_hit_threshold_pct,
    cacheCriticalPct: monitor.cache_hit_critical_pct,
  })

  const trendsAdvisorState = deriveMonitorTrendsAdvisor({
    url: monitor.url,
    range,
    spikeCount: spikes.length,
    hasHistory,
    worstRegion: worstWeekTrendRegion
      ? { label: regionLabels[worstWeekTrendRegion.region] ?? worstWeekTrendRegion.region, changePct: Math.round(worstWeekTrendRegion.change_pct) }
      : null,
  })

  const patternsAdvisorState = deriveMonitorPatternsAdvisor({
    url: monitor.url,
    range,
    monitorId: monitor.id,
    hourlyPattern,
    thresholdMs: monitor.alert_threshold_ms,
    thresholdHitMs: monitor.alert_threshold_hit_ms,
    cacheWarnPct: monitor.alert_cache_hit_threshold_pct,
  })

  const _secProfiles = new Map<string, string[]>()
  for (const row of securityByRegion) {
    const sig = JSON.stringify(buildSecurityComparisonProfile(row.security_headers))
    if (!_secProfiles.has(sig)) _secProfiles.set(sig, [])
    _secProfiles.get(sig)!.push(row.region)
  }
  const _sortedSecProfiles = [..._secProfiles.values()].sort((a, b) => b.length - a.length)
  const _hasDrift = _sortedSecProfiles.length > 1
  const _driftRegionCount = _hasDrift
    ? _sortedSecProfiles.slice(1).reduce((sum, regions) => sum + regions.length, 0)
    : 0
  const securityAdvisorState = deriveMonitorSecurityAdvisor({
    url: monitor.url,
    monitorId: monitor.id,
    securityScore: security?.score ?? null,
    sslDaysRemaining: security?.ssl?.days_remaining ?? null,
    sslProtocol: security?.ssl?.protocol ?? null,
    hasDrift: _hasDrift,
    driftRegionCount: _driftRegionCount,
    hasHsts: !!(security?.hsts),
  })

  const liveFreezeStorageKey = `live_updates_frozen_${monitor.id}`
  const latestDataAt = latestProbes.length > 0
    ? Math.max(...latestProbes.map(p => p.last_probe_at ? new Date(p.last_probe_at).getTime() : 0))
    : null;

  // GLOBAL WATERFALL AGGREGATES
  const liveGlobalWaterfallProbe: WaterfallProbe | null = latestProbes.length > 0 ? {
    region: 'Global',
    dns_ms: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.dns_ms || 0), 0) / latestProbes.length),
    tls_ms: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.tls_ms || 0), 0) / latestProbes.length),
    ttfb_ms: liveAvgTtfb,
    download_ms: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.download_ms || 0), 0) / latestProbes.length),
    total_ms: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.total_ms || 0), 0) / latestProbes.length),
    edge_ms: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.edge_ms || 0), 0) / latestProbes.length),
    origin_ms: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.origin_ms || 0), 0) / latestProbes.length),
    redirect_count: Math.round(latestProbes.reduce((acc, p) => acc + Number(p.redirect_count || 0), 0) / latestProbes.length),
    cache_status: `${liveGlobalHitRate}% HIT`,
    served_by: 'Multi-CDN',
    cdn_provider: 'Various',
    age_s: Math.round(latestProbes.reduce((acc, p) => acc + (p.max_age_s || 0), 0) / latestProbes.length),
    server_timing_breakdown: {
      tcp_ms: Math.round(latestProbes.reduce((acc, p) => acc + (p.tcp_ms || 0), 0) / latestProbes.length)
    },
    probed_at: new Date(latestDataAt || Date.now()),
    ranges: {
      dns_ms: (() => {
        const vals = latestProbes.map(p => p.dns_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      tcp_ms: (() => {
        const vals = latestProbes.map(p => p.tcp_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      tls_ms: (() => {
        const vals = latestProbes.map(p => p.tls_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      ttfb_ms: (() => {
        const vals = latestProbes.map(p => p.ttfb_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      edge_ms: (() => {
        const vals = latestProbes.map(p => p.edge_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      origin_ms: (() => {
        const vals = latestProbes.map(p => p.origin_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      download_ms: (() => {
        const vals = latestProbes.map(p => p.download_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
    }
  } : null;

  const performanceGlobalWaterfallProbe: WaterfallProbe | null = stats.length > 0 ? {
    region: 'Global',
    dns_ms: Math.round(stats.reduce((acc, s) => acc + (s.dns_avg_ms || 0), 0) / stats.length),
    tls_ms: Math.round(stats.reduce((acc, s) => acc + (s.tls_avg_ms || 0), 0) / stats.length),
    ttfb_ms: avgTtfb,
    download_ms: Math.round(stats.reduce((acc, s) => acc + (s.download_avg_ms || 0), 0) / stats.length),
    total_ms: Math.round(stats.reduce((acc, s) => acc + (s.total_avg_ms || 0), 0) / stats.length),
    edge_ms: Math.round(stats.reduce((acc, s) => acc + (s.edge_avg_ms || 0), 0) / stats.length),
    origin_ms: Math.round(stats.reduce((acc, s) => acc + (s.origin_avg_ms || 0), 0) / stats.length),
    redirect_count: Math.round(stats.reduce((acc, s) => acc + (s.redirect_avg || 0), 0) / stats.length),
    cache_status: `${globalHitRate}% HIT`,
    served_by: 'Multi-CDN',
    cdn_provider: 'Various',
    age_s: Math.round(stats.reduce((acc, s) => acc + (s.max_age_s || 0), 0) / stats.length),
    server_timing_breakdown: {
      tcp_ms: Math.round(stats.reduce((acc, s) => acc + (s.tcp_avg_ms || 0), 0) / stats.length)
    },
    probed_at: null,
    ranges: {
      dns_ms: (() => {
        const vals = stats.map(s => s.dns_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      tcp_ms: (() => {
        const vals = stats.map(s => s.tcp_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      tls_ms: (() => {
        const vals = stats.map(s => s.tls_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      ttfb_ms: (() => {
        const vals = stats.map(s => s.ttfb_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      edge_ms: (() => {
        const vals = stats.map(s => s.edge_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      origin_ms: (() => {
        const vals = stats.map(s => s.origin_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
      download_ms: (() => {
        const vals = stats.map(s => s.download_avg_ms).filter((v): v is number => v != null)
        return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
      })(),
    }
  } : null;

  return (
    <div className="space-y-5">
      <RealTimeHub userId={user.id} watchId={monitor.id} pauseStorageKey={liveFreezeStorageKey} />
      <AutoRefresh pauseStorageKey={liveFreezeStorageKey} />
      <div className={`${MONITOR_HEADER_CARD} min-w-0`}>
        {/* Uma linha: contexto (esq.) | estado + ações (dir.) — alinhamento tipo SaaS */}
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 max-w-full shrink sm:max-w-[min(100%,28rem)] sm:pr-2">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.5px] text-zinc-900 dark:text-zinc-50">
              {monitorDisplayName}
            </h1>
            <p className="mt-0.5 truncate text-[13px] tracking-tight text-zinc-500 opacity-60 dark:text-zinc-400">
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
                  <span className="text-zinc-500 dark:text-zinc-300">{monitor.is_active ? 'Active' : 'Paused'}</span>
                </div>
              </PremiumTooltip>

              {isCurrentlyWafBlocked && (
                <PremiumTooltip content="Security interference (WAF) detected in multiple regions. Latency metrics reflect filtering speed, not site performance.">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 shadow-[0_0_12px_rgba(249,115,22,0.1)]">
                    <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-orange-400">WAF Active</span>
                  </div>
                </PremiumTooltip>
              )}



              {globalSyncStatus === 'live' ? (
                <PremiumTooltip content="Live data stream — Instant performance updates" position="top-left">
                  <Link
                    href={buildMonitorHref('performance', range)}
                    className={MONITOR_HEADER_STATUS_BADGE}
                  >
                    <LiveDot />
                    <span className="text-metric-ttfb-fast">Live Sync</span>
                  </Link>
                </PremiumTooltip>
              ) : globalSyncStatus === 'stale' ? (
                <PremiumTooltip content="Last probe is over 1 hour old" position="top-left">
                  <Link
                    href={buildMonitorHref('performance', range)}
                    className={MONITOR_HEADER_STATUS_BADGE}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
                    <span className="text-amber-400">Delayed</span>
                  </Link>
                </PremiumTooltip>
              ) : (
                <PremiumTooltip content="No recent probes — monitor may be offline" position="top-left">
                  <Link
                    href={buildMonitorHref('performance', range)}
                    className={MONITOR_HEADER_STATUS_BADGE}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" aria-hidden />
                    <span className="text-red-400">Offline</span>
                  </Link>
                </PremiumTooltip>
              )}
            </div>

            <div
              className="flex shrink-0 items-center gap-2 sm:gap-3"
              aria-label="Monitor actions"
            >
              {/* Active Incidents compact badge */}
              <PremiumTooltip
                content={activeIncidents.length > 0 ? `${activeIncidents.length} active incident${activeIncidents.length !== 1 ? 's' : ''} — click to review` : 'No active incidents'}
                position="top-left"
              >
                <Link
                  href={buildMonitorHref('incidents', range, null, null, '', monitor.id)}
                  scroll={false}
                  className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0 text-[10px] font-bold uppercase tracking-tight transition-all hover:opacity-80 ${activeIncidents.length > 0
                    ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'border-border bg-white/5 text-zinc-500'
                    }`}
                >
                  <AlertTriangle className={`h-3 w-3 shrink-0 ${activeIncidents.length > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
                  <span>{activeIncidents.length > 0 ? activeIncidents.length : '—'}</span>
                </Link>
              </PremiumTooltip>

              <div
                className="h-6 w-px shrink-0 bg-black/[0.08] opacity-30 dark:bg-white/[0.05]"
                aria-hidden
              />
              <MonitorHeaderToolbar id={monitor.id} isActive={monitor.is_active} range={range} />
            </div>
          </div>
        </div>
      </div>

      {/* Overview cards are now rendered per-tab (Live + Trends only) */}

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


      <div className="grid gap-8 border-t border-white/10 pt-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:pt-6">
        <MonitorSidebarRail
          monitorId={monitor.id}
          range={range}
          activeTab={activeTab}
          activeView={activeView}
          filteredAlertType={filteredAlertType}
        />

        <div className="min-w-0 space-y-8">
          {activeTab === 'performance' && (
            <div>
              {activeView === 'real-time' && (
                <div id="real-time-view" className="space-y-6">
                  {liveAdvisorState && (
                    <AdvisorCard state={liveAdvisorState} hideActions={true} />
                  )}
                  <section id="live-metrics-section" className="space-y-4">
                    <LiveActivityHeader
                      monitorId={monitor.id}
                      freezeStorageKey={liveFreezeStorageKey}
                      latestDataAt={latestDataAt}
                    />

                    {!isCollecting && (
                      <div className="cs-card cs-card-glass overflow-hidden border-white/10">
                        <div className="cs-card-wash opacity-40" />
                        <div className="relative z-10">
                          {/* Metric Headers */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/5 border-b border-white/5">
                            <Link
                              href={buildViewHref('trends', range, monitor.id)}
                              scroll={false}
                              className="px-5 py-4 group hover:bg-white/[0.02] transition-colors block"
                            >
                              <div className="flex items-center justify-between">
                                <PremiumTooltip content="Average latency from recent probes across all regions">
                                  <p className="cs-metric-card-label !text-[11px]">Global TTFB</p>
                                </PremiumTooltip>
                                <PremiumTooltip content={isHistoricalView ? getTtfbTooltip(currentGlobalTtfb, 'global') : (validLiveTtfb.length === 0 ? 'No data available' : (isCurrentlyWafBlocked ? 'WAF detected: this latency reflects security filtering, not page load speed.' : getTtfbTooltip(currentGlobalTtfb, 'global')))}>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-baseline gap-0.5">
                                      {isCurrentlyWafBlocked && <ShieldAlert className="h-5 w-5 text-orange-400 mr-2" />}
                                      <span className={`text-[26px] font-black tracking-tight leading-none ${(currentGlobalTtfb === 0 || isCurrentlyWafBlocked) ? '!text-zinc-500' : getTtfbColorClass(currentGlobalTtfb, 'global')}`}>
                                        {currentGlobalTtfb > 0 ? currentGlobalTtfb : '—'}
                                      </span>
                                      <span className={`text-[13px] font-black uppercase tracking-wider opacity-90 ${(currentGlobalTtfb === 0 || isCurrentlyWafBlocked) ? '!text-zinc-500' : getTtfbColorClass(currentGlobalTtfb, 'global')}`}>ms</span>
                                    </div>
                                    <Gauge className={`h-5 w-5 stroke-[2.5] ${(currentGlobalTtfb === 0 || isCurrentlyWafBlocked) ? 'text-zinc-500 opacity-50' : getTtfbColorClass(currentGlobalTtfb, 'global')}`} />
                                  </div>
                                </PremiumTooltip>
                              </div>
                            </Link>

                            <Link
                              href={buildViewHref('infrastructure', range, monitor.id)}
                              scroll={false}
                              className="px-5 py-4 group hover:bg-white/[0.02] transition-colors block"
                            >
                              <div className="flex items-center justify-between">
                                <PremiumTooltip content="Average cache hit rate from recent probes across all regions">
                                  <p className="cs-metric-card-label !text-[11px]">Global Cache Hit Rate</p>
                                </PremiumTooltip>
                                <PremiumTooltip content={isHistoricalView ? `${globalHitRate}% average cache hit rate over the selected period` : getCacheTooltip(liveGlobalHitRate, 'global')}>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-baseline gap-0.5">
                                      {currentGlobalHitRate === 0 ? (
                                        <span className="text-[20px] font-black tracking-tight leading-none text-zinc-500 uppercase">{isHistoricalView ? dominantStatusLabel : liveDominantStatusLabel}</span>
                                      ) : (
                                        <>
                                          <span className={`text-[26px] font-black tracking-tight leading-none ${getCacheColor(currentGlobalHitRate, 'global')}`}>{currentGlobalHitRate}</span>
                                          <span className={`text-[13px] font-black uppercase tracking-wider opacity-90 ${getCacheColor(currentGlobalHitRate, 'global')}`}>%</span>
                                        </>
                                      )}
                                    </div>
                                    {currentGlobalHitRate > 0 && <Zap className={`h-5 w-5 fill-current ${getCacheColor(currentGlobalHitRate, 'global')}`} />}
                                  </div>
                                </PremiumTooltip>
                              </div>
                            </Link>
                          </div>

                          {/* Global Waterfall Section */}
                          {liveGlobalWaterfallProbe && (
                            <div className="p-5 bg-black/10">
                              <div className="flex items-center gap-2 mb-4">
                                <h3 className="cs-view-section-title !text-[10px] !text-zinc-500">Global Performance Breakdown</h3>
                              </div>
                              <ProbeWaterfall
                                probes={[liveGlobalWaterfallProbe]}
                                regionLabels={{ 'Global': 'Global Aggregate' }}
                                hideHeader={true}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {latestProbes.length > 0 ? (
                      <LiveTable
                        probes={latestProbes}
                        regionLabels={regionLabels}
                        regionDescriptions={regionDescriptions}
                        globalAvgTtfb={liveAvgTtfb}
                        thresholdMs={monitor.alert_threshold_ms}
                        thresholdHitMs={monitor.alert_threshold_hit_ms}
                      />
                    ) : (
                      <div className="cs-card cs-card-glass min-h-[200px] flex flex-col items-center justify-center p-8 text-center animate-pulse">
                        <Activity className="h-8 w-8 text-zinc-600 mb-3" />
                        <p className="text-zinc-500 text-sm font-medium">Awaiting live synchronization...</p>
                      </div>
                    )}
                  </section>

                  <section id="live-hub-section">
                    <RealTimeHub userId={user.id} watchId={monitor.id} />
                  </section>
                </div>
              )}

              {activeView === 'performance' && (
                <div className="space-y-6">
                  {performanceAdvisorState && (
                    <AdvisorCard state={performanceAdvisorState} hideActions={true} />
                  )}
                  <section className="space-y-4">
                    <ViewSectionHeader
                      title={
                        <div className="flex items-baseline gap-2">
                          <span>Period Performance</span>
                          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-400 opacity-70">
                            · {range.toUpperCase()}
                          </span>
                        </div>
                      }
                    >
                      <div className="flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 px-1.5 border border-zinc-200 dark:border-white/10">
                        {(['1h', '4h', '24h', '7d', '30d', '90d'] as const).map((r) => (
                          <PremiumTooltip key={r} content={TIMEFRAME_TOOLTIPS[r]}>
                            <Link
                              href={buildViewHref('performance', r)}
                              className={`px-3 h-6 flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${range === r
                                ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-lg shadow-black/5 ring-1 ring-black/5'
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                                }`}
                            >
                              {r}
                            </Link>
                          </PremiumTooltip>
                        ))}
                      </div>
                    </ViewSectionHeader>

                    {!isCollecting && (
                      <div className="cs-card cs-card-glass overflow-hidden border-white/10">
                        <div className="cs-card-wash opacity-40" />
                        <div className="relative z-10">
                          {/* Metric Headers */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/5 border-b border-white/5">
                            <Link
                              href={buildViewHref('trends', range, monitor.id)}
                              scroll={false}
                              className="px-5 py-4 group hover:bg-white/[0.02] transition-colors block"
                            >
                              <div className="flex items-center justify-between">
                                <PremiumTooltip content={`Average Time to First Byte during the last ${range} across all regions`}>
                                  <p className="cs-metric-card-label !text-[11px]">Global TTFB</p>
                                </PremiumTooltip>
                                <PremiumTooltip content={isCurrentlyWafBlocked ? 'WAF detected: this latency reflects security filtering, not page load speed.' : (avgTtfb === 0 ? 'No data available' : getTtfbTooltip(avgTtfb, 'global'))}>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-baseline gap-0.5">
                                      {isCurrentlyWafBlocked && <ShieldAlert className="h-5 w-5 text-orange-400 mr-2" />}
                                      <span className={`text-[26px] font-black tracking-tight leading-none ${(avgTtfb === 0 || isCurrentlyWafBlocked) ? '!text-zinc-500' : getTtfbColorClass(avgTtfb, 'global')}`}>
                                        {avgTtfb > 0 ? avgTtfb : '—'}
                                      </span>
                                      <span className={`text-[13px] font-black uppercase tracking-wider opacity-90 ${(avgTtfb === 0 || isCurrentlyWafBlocked) ? '!text-zinc-500' : getTtfbColorClass(avgTtfb, 'global')}`}>ms</span>
                                    </div>
                                    <Gauge className={`h-5 w-5 stroke-[2.5] ${(avgTtfb === 0 || isCurrentlyWafBlocked) ? '!text-zinc-500 opacity-50' : getTtfbColorClass(avgTtfb, 'global')}`} />
                                  </div>
                                </PremiumTooltip>
                              </div>
                            </Link>

                            <Link
                              href={buildViewHref('infrastructure', range, monitor.id)}
                              scroll={false}
                              className="px-5 py-4 group hover:bg-white/[0.02] transition-colors block"
                            >
                              <div className="flex items-center justify-between">
                                <PremiumTooltip content={`Average cache hit rate from CDN edge cache during the last ${range} across all regions`}>
                                  <p className="cs-metric-card-label !text-[11px]">Global Cache Hit Rate</p>
                                </PremiumTooltip>
                                <PremiumTooltip content={globalHitRate === 0 ? (isGlobalDynamic ? 'Site is intentionally dynamic: All requests fetched from origin' : 'No data available') : getCacheTooltip(globalHitRate, 'global')}>
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-baseline gap-0.5">
                                      {isGlobalDynamic ? (
                                        <span className="text-[20px] font-black tracking-tight leading-none text-zinc-500 uppercase">{dominantStatusLabel}</span>
                                      ) : (
                                        <>
                                          <span className={`text-[26px] font-black tracking-tight leading-none ${getCacheColor(globalHitRate, 'global')}`}>{globalHitRate}</span>
                                          <span className={`text-[13px] font-black uppercase tracking-wider opacity-90 ${getCacheColor(globalHitRate, 'global')}`}>%</span>
                                        </>
                                      )}
                                    </div>
                                    {!isGlobalDynamic && <Zap className={`h-5 w-5 fill-current ${getCacheColor(globalHitRate, 'global')}`} />}
                                  </div>
                                </PremiumTooltip>
                              </div>
                            </Link>
                          </div>

                          {/* Global Waterfall Section */}
                          {performanceGlobalWaterfallProbe && (
                            <div className="p-5 bg-black/10">
                              <div className="flex items-center gap-2 mb-4">
                                <h3 className="cs-view-section-title !text-[10px] !text-zinc-500">Global Performance Breakdown</h3>
                              </div>
                              <ProbeWaterfall
                                probes={[performanceGlobalWaterfallProbe]}
                                regionLabels={{ 'Global': 'Global Aggregate' }}
                                hideHeader={true}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {stats.length === 0 ? (
                      <p className="text-sm text-zinc-400">Compiling historical insights...</p>
                    ) : (
                      <PerformanceTable
                        stats={stats}
                        regionLabels={regionLabels}
                        regionDescriptions={regionDescriptions}
                        globalAvgTtfb={avgTtfb}
                        liveDominantStatus={liveDominantStatus}
                        thresholdMs={monitor.alert_threshold_ms}
                        thresholdHitMs={monitor.alert_threshold_hit_ms}
                        cacheWarnPct={monitor.alert_cache_hit_threshold_pct}
                        cacheCriticalPct={monitor.cache_hit_critical_pct}
                      />
                    )}
                  </section>

                </div>
              )}

              {activeView === 'trends' && (
                <div className="space-y-6">
                  {trendsAdvisorState && (
                    <AdvisorCard state={trendsAdvisorState} hideActions={true} />
                  )}
                  {stats.length === 0 ? (
                    <section className="space-y-4">
                      <ViewSectionHeader title="Trends" />
                      <div className="cs-card cs-card-glass min-h-[180px] flex flex-col items-center justify-center p-8 text-center animate-[cs-fade-in_0.5s_ease-out]">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-[0_0_24px_-8px_rgba(34,211,238,0.15)]">
                          <BarChart3 className="h-5 w-5 text-zinc-500 animate-pulse" />
                        </div>
                        <p className="text-sm font-black tracking-tight text-zinc-300">
                          {isCollecting ? 'Analyzing Historical Patterns' : 'Compiling Insights'}
                        </p>
                        <p className="mt-1.5 max-w-[280px] text-[11px] leading-relaxed text-zinc-500">
                          {isCollecting
                            ? "We're gathering the first 30 minutes of data to build your performance baseline."
                            : "No historical data found for this time window. Try selecting a broader range."}
                        </p>
                      </div>
                    </section>
                  ) : (
                    <TtfbChart data={chartPoints} range={range} regionMeta={regionMeta} cacheHitThresholdPct={monitor.alert_cache_hit_threshold_pct} isDown={isDown} monitorId={id} />
                  )}

                  {activeView === 'trends' && spikes.length > 0 && (
                    <section className="space-y-4">
                      <ViewSectionHeader title={`Recent performance spikes — ${range === '1h' ? 'last hour' : range === '4h' ? 'last 4 hours' : range === '7d' ? 'last 7 days' : range === '30d' ? 'last 30 days' : range === '90d' ? 'last 90 days' : 'last 24 hours'}`} />
                      <div className="rounded-2xl border border-border bg-surface divide-y divide-white/[0.03] overflow-hidden">
                        {spikes.map((spike, index) => (
                          <div key={index} className="flex items-center justify-between py-5 px-4 hover:bg-white/[0.03] transition-all group/spike">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                <span className="text-[9px] font-bold text-zinc-400 tabular-nums uppercase tracking-widest">
                                  {new Date(spike.bucket).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              </div>
                              <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest group-hover/spike:text-white transition-colors">{regionLabels[spike.region] ?? spike.region}</span>
                            </div>

                            <div className="flex items-center gap-5 tabular-nums">
                              <div className="text-[10px] font-medium flex items-center gap-1.5">
                                <PremiumTooltip content={`Baseline: region average during the previous ${bucketSize} window`}>
                                  <span className="text-zinc-400 line-through decoration-zinc-700/30 cursor-help">{spike.prev_avg}ms</span>
                                </PremiumTooltip>
                                <span className="text-zinc-500/30">→</span>
                                <PremiumTooltip content={`Spike: average during this ${bucketSize} window`}>
                                  <span className="font-bold text-red-400 cursor-help">{spike.ttfb_avg}ms</span>
                                </PremiumTooltip>
                              </div>
                              <PremiumTooltip content={`Absolute increase in response time vs previous window`}>
                                <div className="px-2 py-0.5 rounded text-[9px] font-black min-w-[65px] text-center bg-red-500/10 text-red-400 ring-1 ring-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.1)] cursor-help">
                                  +{spike.spike_ms}ms
                                </div>
                              </PremiumTooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[11px] text-zinc-500 italic leading-relaxed">
                        Spikes are identified by comparing consecutive {bucketSize} windows.
                        A 50% increase (minimum 150ms delta) triggers a detection in this period.
                      </p>
                    </section>
                  )}

                  {activeView === 'trends' && weekTrend.length > 0 && (
                    <section className="space-y-4">
                      <ViewSectionHeader title="Week-over-week performance trend" />
                      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm space-y-4">
                        <div className="flex items-center gap-4 mb-4 px-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-zinc-400" />
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Current Week</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-0.5 h-3 bg-white/30" />
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Previous Week (Avg)</span>
                          </div>
                        </div>
                        <div className="space-y-5">
                          {(() => {
                            const maxMs = Math.max(...weekTrend.flatMap(t => [t.current_avg_ms, t.previous_avg_ms]), 1)
                            return weekTrend.map(t => {
                              const improved = t.change_pct < -0.5
                              const worsened = t.change_pct > 0.5

                              const barColor = improved
                                ? '#10b981' // Emerald-500
                                : worsened
                                  ? '#f43f5e' // Rose-500
                                  : '#f59e0b' // Amber-500 (Stable)

                              const currentWidth = (t.current_avg_ms / maxMs) * 100
                              const previousWidth = (t.previous_avg_ms / maxMs) * 100

                              return (
                                <div key={t.region} className="space-y-1.5 py-1.2 border-b border-white/[0.03] last:border-0 group/row">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-black text-zinc-300 min-w-[110px] uppercase tracking-widest transition-colors group-hover/row:text-white">{regionLabels[t.region] ?? t.region}</span>
                                    <div className="flex items-center gap-6 tabular-nums">
                                      <div className="text-[10px] font-medium flex items-center gap-2">
                                        <span className="text-zinc-400 line-through decoration-zinc-600/30">{t.previous_avg_ms}ms</span>
                                        <span className="text-zinc-500/30">→</span>
                                        <span className="text-zinc-200 font-bold text-[10px]">{t.current_avg_ms}ms</span>
                                      </div>
                                      <div className={`px-2 py-0.5 rounded-md text-[9px] font-black transition-all duration-300 min-w-[50px] text-center ${improved ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : worsened ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'}`}>
                                        {improved ? '▼' : worsened ? '▲' : '•'} {Math.abs(t.change_pct)}%
                                      </div>
                                    </div>
                                  </div>

                                  <div className="relative h-2.5 w-full bg-white/[0.02] rounded-full overflow-hidden group/bar ring-1 ring-white/[0.05]">
                                    {/* Previous Week Shadow Trail */}
                                    <div
                                      className="absolute inset-y-0 left-0 bg-white/[0.04] transition-all duration-700"
                                      style={{ width: `${previousWidth}%` }}
                                    />

                                    {/* Improvement "Gain Zone" Highlight */}
                                    {improved && (
                                      <div
                                        className="absolute inset-y-0 bg-emerald-500/5 border-l border-emerald-500/10 transition-all duration-700"
                                        style={{ left: `${currentWidth}%`, width: `${previousWidth - currentWidth}%` }}
                                      />
                                    )}

                                    {/* Current Week Bar */}
                                    <div
                                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 z-10"
                                      style={{
                                        width: `${currentWidth}%`,
                                        backgroundColor: barColor,
                                        boxShadow: `4px 0 10px ${barColor}40`
                                      }}
                                    />

                                    {/* Previous Week Needle (Marker) */}
                                    <div
                                      className="absolute inset-y-0 w-[1.5px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-20 transition-all duration-700"
                                      style={{ left: `${previousWidth}%` }}
                                    />
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                      <p className="mt-1.5 text-xs text-zinc-400 italic">Comparing last 7 days vs the prior 7 days.</p>
                    </section>
                  )}
                </div>
              )}

              {activeView === 'patterns' && (
                <div id="patterns-view" className="space-y-6">
                  {patternsAdvisorState && (
                    <AdvisorCard state={patternsAdvisorState} hideActions={true} />
                  )}
                  {hourlyPattern.length === 0 && heatmapRows.length === 0 ? (
                    <section id="patterns-empty-state" className="space-y-4">
                      <ViewSectionHeader title="Patterns Analysis" />
                      <div className="cs-card cs-card-glass min-h-[300px] flex flex-col items-center justify-center p-12 text-center animate-[cs-fade-in_0.5s_ease-out]">
                        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-[0_0_32px_-8px_rgba(34,211,238,0.2)]">
                          <History className="h-7 w-7 text-zinc-500 animate-pulse" />
                        </div>
                        <h3 className="text-lg font-black tracking-tight text-zinc-300 uppercase">Awaiting Statistical Density</h3>
                        <p className="mt-2.5 max-w-[420px] text-[13px] leading-relaxed text-zinc-500">
                          Meaningful hourly and weekly patterns require a broader historical window to emerge.
                          Currently, your monitor needs more samples or a wider time selection.
                        </p>
                        <div className="mt-8">
                          <Link
                            id="btn-analyze-7d"
                            href={buildViewHref('patterns', '7d', id)}
                            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] border border-white/10 px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/10 hover:scale-[1.02] active:scale-[0.98] shadow-xl"
                          >
                            <CalendarDays className="h-4 w-4 text-emerald-400" />
                            Analyze 7-Day History
                          </Link>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <div className="space-y-8">
                      {hourlyPattern.length > 0 && (
                        <section id="hourly-pattern-section" className="space-y-4">
                          <ViewSectionHeader
                            title={
                              <div className="flex items-baseline gap-2">
                                <span>Hourly Pattern</span>
                                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-400 opacity-70">
                                  · {range.toUpperCase()}
                                </span>
                              </div>
                            }
                          />
                          <HourlyPatternChart
                            data={hourlyPattern}
                            range={range}
                            thresholdMs={monitor.alert_threshold_ms}
                            thresholdHitMs={monitor.alert_threshold_hit_ms}
                            cacheWarnPct={monitor.alert_cache_hit_threshold_pct}
                            cacheCriticalPct={monitor.cache_hit_critical_pct}
                          />
                        </section>
                      )}

                      {heatmapRows.length > 0 && (
                        <section id="weekly-pattern-section" className="space-y-4">
                          <ViewSectionHeader title="Weekly Heatmap" />
                          <TtfbHeatmap
                            data={heatmapRows}
                            thresholdMs={monitor.alert_threshold_ms}
                            thresholdHitMs={monitor.alert_threshold_hit_ms}
                            cacheWarnPct={monitor.alert_cache_hit_threshold_pct}
                            cacheCriticalPct={monitor.cache_hit_critical_pct}
                          />
                        </section>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 
                DEPRECATED: Breakdown (diagnostics) view is no longer used. 
                Kept commented for reference but should not be enabled.
              {activeView === 'diagnostics' && (
                <div id="breakdown-view" className="space-y-4">
                  <ViewSectionHeader title="Performance Breakdown" showDot={true} />
                  {waterfallProbes.length > 0 ? (
                    <ProbeWaterfall probes={waterfallProbes} regionLabels={regionLabels} />
                  ) : (
                    <p className="text-sm text-zinc-400 italic">No breakdown data available yet.</p>
                  )}
                </div>
              )}
              */}

              {activeView === 'infrastructure' && (
                <div className="space-y-8">
                  <EdgeVsOrigin
                    data={hourlyBypass.map(d => ({
                      ...d,
                      edge_cache_status: d.edge_cache_status || 'UNKNOWN',
                      origin_cache_status: d.origin_cache_status || 'UNKNOWN'
                    }))}
                    regionLabels={regionLabels}
                    isDown={isDown}
                    readiness={auditReadiness ? {
                      state: auditReadiness.state as 'disabled' | 'warmup' | 'enabled',
                      reason: auditReadiness.reason,
                      comparable_pairs: auditReadiness.comparable_pairs,
                      comparable_regions: auditReadiness.comparable_regions,
                      edge_hit_ratio: auditReadiness.edge_hit_ratio,
                      updated_at: auditReadiness.updated_at,
                    } : null as any}
                  />
                </div>
              )}
            </div>
          )}


          {activeTab === 'settings' && (
            <div className="space-y-4">
              <ViewSectionHeader title="Monitor configuration" showDot={false} />
              {(() => {
                const globalHitAvg = stats.length > 0
                  ? Math.round(stats.reduce((acc, s) => acc + Number(s.edge_avg_ms || 0), 0) / stats.length)
                  : 0;
                const globalMissAvg = stats.length > 0
                  ? Math.round(stats.reduce((acc, s) => acc + Number(s.origin_avg_ms || 0), 0) / stats.length)
                  : 0;
                return (
                  <MonitorSettingsPanel
                    {...monitor}
                    checkIntervalSeconds={monitor.check_interval_seconds}
                    auditIntervalSeconds={monitor.audit_interval_seconds}
                    notifyEmail={monitor.notify_email}
                    notifyEmailEnabled={monitor.notify_email_enabled}
                    notifySlackWebhook={monitor.notify_slack_webhook}
                    notifySlackEnabled={monitor.notify_slack_enabled}
                    alertThresholdMs={monitor.alert_threshold_ms}
                    alertThresholdHitMs={monitor.alert_threshold_hit_ms}
                    alertSensitivity={monitor.alert_sensitivity}
                    alertDownEnabled={monitor.alert_down_enabled}
                    alertTtfbEnabled={monitor.alert_ttfb_enabled}
                    alertTtfbAnomalyEnabled={monitor.alert_ttfb_anomaly_enabled}
                    alertAnycastEnabled={monitor.alert_anycast_enabled}
                    alertCacheAgeEnabled={monitor.alert_cache_age_enabled}
                    alertCacheAgeThresholdHours={monitor.alert_cache_age_threshold_hours}
                    alertCacheHitEnabled={monitor.alert_cache_hit_enabled}
                    alertCacheHitThresholdPct={monitor.alert_cache_hit_threshold_pct}
                    cacheHitCriticalPct={monitor.cache_hit_critical_pct}
                    alertCacheHitTrendEnabled={monitor.alert_cache_hit_trend_enabled}
                    alertCacheHitTrendThresholdPp={monitor.alert_cache_hit_trend_threshold_pp}
                    alertCacheHitTrendComparators={(monitor.alert_cache_hit_trend_comparators ?? ['prev_hour', 'day_avg']) as TrendComparator[]}
                    alertTtfbTrendEnabled={monitor.alert_ttfb_trend_enabled}
                    alertTtfbTrendThresholdPct={monitor.alert_ttfb_trend_threshold_pct}
                    alertTtfbTrendComparators={(monitor.alert_ttfb_trend_comparators ?? ['prev_hour', 'day_avg']) as TrendComparator[]}
                    alertTtfbTrendDirection={(monitor.alert_ttfb_trend_direction ?? 'worsening') as 'worsening' | 'both'}
                    alertCacheHitTrendGlobalEnabled={monitor.alert_cache_hit_trend_global_enabled}
                    alertCacheHitTrendGlobalThresholdPp={monitor.alert_cache_hit_trend_global_threshold_pp}
                    alertTtfbTrendGlobalEnabled={monitor.alert_ttfb_trend_global_enabled}
                    alertTtfbTrendGlobalThresholdPct={monitor.alert_ttfb_trend_global_threshold_pct}
                    globalHitAvg={globalHitAvg}
                    globalMissAvg={globalMissAvg}
                  />
                );
              })()}
            </div>
          )}


          {activeTab === 'security' && (
            <div className="space-y-4">
              <ViewSectionHeader title="Security Headers Audit" />
              {securityAdvisorState && (
                <AdvisorCard state={securityAdvisorState} hideActions={true} />
              )}

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
                  const sig = JSON.stringify(buildSecurityComparisonProfile(row.security_headers))
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
                            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm">
                              <div className={BRAND_CARD_SURFACE_GRADIENT} />
                              <div className="relative">
                                <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 space-y-1">
                                    <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                                      SSL / TLS Profile
                                    </h3>
                                    <p className="text-sm text-zinc-500">
                                      Leaf certificate observed on the TLS handshake for this probe profile. New probes may refresh issuer
                                      metadata.
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
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
                                  </div>
                                  <div
                                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 sm:justify-end ${urgent
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
                                        className={`text-sm font-bold tabular-nums ${urgent ? 'text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                                          }`}
                                      >
                                        {daysRem} days left
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="relative flex flex-col border-b border-border/60 py-3 sm:flex-row sm:items-start sm:py-2.5">
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

                                <div className="relative space-y-3 py-4">
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
                                  <div className="relative grid gap-4 border-t border-border/80 py-5 md:grid-cols-2">
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
                              <h3 className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                                Global Security Profile
                              </h3>
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
                                  <div key={r} title={regionLabels[r]} className="flex h-6 w-6 cursor-help items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-[8px] font-bold text-white shadow-sm dark:border-zinc-950">
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
                        <div className="grid gap-4 md:grid-cols-2 items-start">
                          {secondaryProfiles.map((prof, idx) => (
                            <div key={idx} className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/20 p-4 shadow-sm space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-red-700 dark:text-red-400">Variant configuration</p>
                                <div className="flex gap-1">
                                  {prof.regions.map(r => (
                                    <span key={r} className="text-[10px] font-bold bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 text-red-600">
                                      {regionLabels[r]}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                {SECURITY_HEADERS_LABELS.map(h => {
                                  const mainVal = mainProfile.headers?.[h.key]
                                  const driftVal = prof.headers?.[h.key]
                                  const normalizedMainVal = normalizeSecurityHeaderValue(h.key, mainVal)
                                  const normalizedDriftVal = normalizeSecurityHeaderValue(h.key, driftVal)
                                  if (JSON.stringify(normalizedMainVal) === JSON.stringify(normalizedDriftVal)) return null
                                  return (
                                    <div key={h.key} className="text-[10px] p-2 bg-white/40 dark:bg-zinc-950/40 rounded border border-red-50 dark:border-red-900/30">
                                      <p className="font-bold text-zinc-600 dark:text-zinc-400 uppercase mb-1">{h.label}</p>

                                      {(() => {
                                        const mainStr = String(mainVal || 'Missing')
                                        const driftStr = String(driftVal || 'Missing')
                                        const isLong = mainStr.length > 80 || driftStr.length > 80

                                        if (!isLong) {
                                          return (
                                            <div className="grid grid-cols-2 gap-2 italic">
                                              <div><span className="text-zinc-400">Main:</span><br /><span className="text-emerald-600/70 line-through decoration-emerald-800/30">{mainStr}</span></div>
                                              <div><span className="text-red-600 font-bold">Drift:</span><br /><span className="text-red-700 dark:text-red-400">{driftStr}</span></div>
                                            </div>
                                          )
                                        }

                                        return (
                                          <details className="group/drift">
                                            <summary className="flex items-center justify-between cursor-pointer list-none outline-none py-1 group-open/drift:mb-2">
                                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                <span className="text-[9px] text-zinc-500 italic truncate opacity-80 group-open/drift:hidden">
                                                  Value drift detected (Long string)
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter group-open/drift:hidden">Review Details</span>
                                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter hidden group-open/drift:inline">Hide Details</span>
                                              </div>
                                            </summary>
                                            <div className="space-y-2 border-t border-red-500/10 pt-2 animate-[cs-fade-in_0.2s_ease-out]">
                                              <div className="space-y-1">
                                                <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tight">Main (Expected)</span>
                                                <div className="rounded border border-emerald-500/10 bg-emerald-500/[0.02] p-2">
                                                  <code className="block text-[9px] text-emerald-600/60 line-through break-all font-mono leading-relaxed">
                                                    {mainStr}
                                                  </code>
                                                </div>
                                              </div>
                                              <div className="space-y-1">
                                                <span className="text-[8px] font-bold text-red-500 uppercase tracking-tight">Drift (Observed)</span>
                                                <div className="rounded border border-red-500/20 bg-red-500/[0.03] p-2 shadow-inner">
                                                  <code className="block text-[9px] text-red-700 dark:text-red-400 break-all font-mono leading-relaxed">
                                                    {driftStr}
                                                  </code>
                                                </div>
                                              </div>
                                            </div>
                                          </details>
                                        )
                                      })()}
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
            </div>
          )}

          {activeTab === 'incidents' && (
            <section className="space-y-4">
              <ViewSectionHeader title="Incident overview" showDot={true} dotColorClass="bg-amber-500" />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-zinc-400" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                      {range === '1h' ? 'Last Hour' : range === '4h' ? 'Last 4h' : range === '7d' ? 'Last 7d' : range === '30d' ? 'Last 30d' : range === '90d' ? 'Last 90d' : 'Last 24h'} Volume
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      {incidentTrends.reduce((sum, t) => sum + t.count, 0)}
                    </span>
                    <span className="text-xs text-zinc-400">alert events</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface p-4 shadow-sm relative group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-zinc-400" />
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Top Issue</span>
                    </div>
                    <PremiumTooltip content="The most frequent type of alert triggered in this time window." position="top-right">
                      <Info className="h-3.5 w-3.5 text-zinc-400/50 hover:text-zinc-300 transition-colors" />
                    </PremiumTooltip>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 uppercase truncate">
                      {(() => {
                        if (alerts.length === 0) return 'Clear';
                        const typeCounts = alerts.reduce((acc, a) => {
                          acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);
                        const mainType = Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b);
                        return ALERT_TYPE_LABELS[mainType as AlertType] ?? mainType.replace('_', ' ');
                      })()}
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
                  <div className="h-24 w-full flex items-end gap-[2px] px-1">
                    {(() => {
                      const maxCount = Math.max(...incidentTrends.map(t => Number(t.count)), 1)
                      const now = new Date()
                      const last24h = Array.from({ length: 24 }, (_, i) => {
                        const d = new Date(now)
                        d.setHours(d.getHours() - (23 - i), 0, 0, 0)

                        const match = incidentTrends.find(t => {
                          const bucketDate = new Date(t.bucket);
                          return bucketDate.getHours() === d.getHours() && bucketDate.getDate() === d.getDate();
                        });

                        return {
                          label: d.getHours(),
                          count: match ? Number(match.count) : 0
                        }
                      })

                      return last24h.map((t, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                          <div
                            className={`w-full rounded-t-sm transition-all ${t.count > 0 ? 'bg-red-500/60 hover:bg-red-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                            style={{ height: `${Math.max((t.count / maxCount) * 100, 4)}%` }}
                          >
                            {t.count > 0 && (
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10">
                                {t.count} incident{t.count > 1 ? 's' : ''} @ {t.label.toString().padStart(2, '0')}:00
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

              <div className="pt-2">
                <ActiveIncidentsPanel monitorId={monitor.id} incidents={activeIncidents} regionLabels={regionLabels} />
              </div>

              <div className="flex justify-end pt-1">
                <Link
                  href={buildMonitorHref('alert-history', range, null, null, '', monitor.id)}
                  scroll={false}
                  className="text-[11px] font-semibold text-zinc-500 hover:text-[var(--brand-primary)] transition-colors"
                >
                  View alert history →
                </Link>
              </div>
            </section>
          )}

          {activeTab === 'alert-history' && (
            <section id="alert-history" className="space-y-4 scroll-mt-24">
              <ViewSectionHeader title="Alert History" showDot={true} dotColorClass="bg-amber-500" />

              <div className="flex flex-wrap gap-1 bg-surface border border-border p-1.5 rounded-lg">
                <Link
                  href={buildMonitorHref('alert-history', range, null, null, '', monitor.id)}
                  scroll={false}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all ${filteredAlertType == null
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5'
                    }`}
                >
                  All
                </Link>
                {VALID_ALERT_TYPES.map(type => (
                  <Link
                    key={type}
                    href={buildMonitorHref('alert-history', range, type, null, '', monitor.id)}
                    scroll={false}
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all ${filteredAlertType === type
                      ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5'
                      }`}
                  >
                    {ALERT_TYPE_LABELS[type]}
                  </Link>
                ))}
              </div>

              {alerts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-surface/30 p-12 flex flex-col items-center justify-center min-h-[400px] text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">No alerts detected</h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-[240px] mx-auto">This monitor is currently healthy and performing within expected baselines.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <AlertHistoryTable alerts={alerts} regionLabels={regionLabels} />

                  {hasNextAlertsPage && (
                    <div className="flex justify-center pb-4">
                      <Link
                        href={buildMonitorHref('alert-history', range, filteredAlertType, alertsLimit + 100, '', monitor.id)}
                        className="cs-btn cs-btn-secondary !text-[10px] !px-6 !py-2.5 font-black uppercase tracking-widest flex items-center gap-2 group/load"
                        scroll={false}
                      >
                        <History className="w-3.5 h-3.5 group-hover/load:rotate-[-45deg] transition-transform" />
                        Load more history
                      </Link>
                    </div>
                  )}
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
