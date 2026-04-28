import { Fragment } from 'react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isCacheHit } from '@/lib/cache-utils'
import sql from '@/lib/db'
import { AutoRefresh } from './auto-refresh'
import { TtfbChart, type ChartPoint } from './ttfb-chart'
import { HourlyPatternChart } from './hourly-pattern-chart'
import { TtfbHeatmap } from './ttfb-heatmap'
import { MonitorHeaderToolbar } from './monitor-header-toolbar'
import { MonitorSettingsPanel } from './monitor-settings-panel'
import { type TrendComparator } from './monitor-edit-form'
import { LiveActivityHeader } from './live-activity-header'
import { RealTimeHub } from '../../real-time-hub'
import { ViewSectionHeader, LiveDot } from '@/components/dashboard/dashboard-ui'
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
import { getRegions } from '@/lib/regions'
import { getCacheColor, getTtfbColorClass, getTtfbTooltip, getCacheTooltip } from '@/lib/thresholds'
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
  Gauge,
  Fingerprint,
  Settings,
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
  error: string | null
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
  delta_pct: number | null
  comparator: string | null
  scope: string | null
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

const TAB_ICONS: Record<MonitorTab, LucideIcon> = {
  performance: Activity,
  'on-demand': PlayCircle,
  resilience: TrendingUp,
  security: Lock,
  settings: Settings,
  incidents: AlertCircle,
}

const VALID_PERFORMANCE_VIEWS = ['real-time', 'performance', 'trends', 'diagnostics', 'infrastructure'] as const satisfies readonly PerformanceView[]

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Live',
  performance: 'Performance',
  trends: 'Trends',
  diagnostics: 'Diagnostics',
  infrastructure: 'Edge Audit',
}

/** Monitor title card — subtle top wash + glass (Vercel-style). Densidade ~tool (menos padding vertical). */
const MONITOR_HEADER_CARD =
  'cs-card cs-card-glass px-5 py-2.5 relative'

const TOOLTIP_EDGE_DATA_UNAVAILABLE = 'Data not available yet'

function regionRowServedFromLabel(servedBy: string | null): string {
  if (!servedBy?.trim()) return ''
  return (popToCity(extractPop(servedBy) || '') || extractPop(servedBy) || '').trim()
}

function regionRowCdnLabelTrimmed(
  provider: string | null | undefined,
  servedBy: string | null | undefined
): string {
  return (resolveCdnLabel(provider, servedBy) ?? '').trim()
}

/** Status pills in the monitor title bar — consistent shell + interactive hover. */
const MONITOR_HEADER_STATUS_BADGE =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border bg-white/5 px-2.5 py-0 text-[10px] font-bold uppercase tracking-tight transition-colors hover:bg-white/10 text-zinc-300'

/** Active monitor dot — soft mint glow + pulse (“system alive”). */
const MONITOR_HEADER_ACTIVE_DOT =
  'bg-[var(--brand-primary)] [box-shadow:0_0_8px_rgba(34,255,136,0.5)]'

const VALID_ALERT_TYPES = [
  'down', 'anomaly', 'anycast', 'zombie_cache', 'cache_hit_low',
  'cache_hit_trend_drop_region', 'cache_hit_trend_drop_global',
  'ttfb_trend_up_region', 'ttfb_trend_up_global',
  'ttfb_trend_down_region', 'ttfb_trend_down_global',
] as const satisfies readonly AlertType[]

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  down: 'Offline',
  anomaly: 'Anomaly',
  anycast: 'Anycast',
  cache_hit_trend_drop_region: 'Cache Hit ↓ (region)',
  cache_hit_trend_drop_global: 'Cache Hit ↓ (global)',
  ttfb_trend_up_region: 'TTFB ↑ (region)',
  ttfb_trend_up_global: 'TTFB ↑ (global)',
  ttfb_trend_down_region: 'TTFB ↓ (region)',
  ttfb_trend_down_global: 'TTFB ↓ (global)',
  zombie_cache: 'Zombie cache',
  cache_hit_low: 'Cache hit low',
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

/** `Age` header semantics: seconds in shared cache. Tiers for emphasis (zombie_cache alert: age_s > 86_400). */
const AGE_RECENT_MAX_S = 3600 // ≤1h — still “fresh” at the edge
const AGE_ZOMBIE_THRESHOLD_S = 86_400 // same boundary as probe-waterfall zombie detection (strictly older = red)

function ageBadgeVisual(ageSeconds: number): { className: string; tierHint: string } {
  if (ageSeconds <= AGE_RECENT_MAX_S) {
    return {
      className: 'cs-badge-muted',
      tierHint: 'Recently cached (≤1h)',
    }
  }
  if (ageSeconds <= AGE_ZOMBIE_THRESHOLD_S) {
    return {
      className: 'cs-badge-warning',
      tierHint: 'Elevated cache age (>1h, up to 24h)',
    }
  }
  return {
    className: 'cs-badge-danger',
    tierHint: 'Zombie cache (>24h) — review invalidation / TTL',
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

  const range = rangeValue === '7d' ? '7d'
    : rangeValue === '30d' ? '30d'
      : rangeValue === '90d' ? '90d'
        : '24h'
  const dbInterval = range === '7d' ? '7 days'
    : range === '30d' ? '30 days'
      : range === '90d' ? '90 days'
        : '24 hours'
  const bucketSize = range === '7d' ? '6 hours'
    : range === '30d' ? '1 day'
      : range === '90d' ? '3 days'
        : '30 minutes'
  const activeTab = normalizeTab(tabValue)
  const filteredAlertType = normalizeAlertType(alertTypeValue)
  const activeView: PerformanceView = activeTab === 'performance' ? normalizeView(viewValue) : 'real-time'

  const [monitor] = await sql<{
    id: string; url: string; name: string | null; is_active: boolean; check_interval_seconds: number; audit_interval_seconds: number;
    notify_email: string | null; notify_email_enabled: boolean;
    notify_slack_webhook: string | null; notify_slack_enabled: boolean;
    alert_threshold_ms: number; alert_sensitivity: number;
    alert_down_enabled: boolean; alert_anomaly_enabled: boolean;
    alert_anycast_enabled: boolean; alert_zombie_cache_enabled: boolean;
    alert_cache_hit_enabled: boolean; alert_cache_hit_threshold_pct: number;
    alert_cache_hit_trend_enabled: boolean; alert_cache_hit_trend_threshold_pct: number; alert_cache_hit_trend_comparators: string[];
    alert_ttfb_trend_enabled: boolean; alert_ttfb_trend_threshold_pct: number; alert_ttfb_trend_comparators: string[];
    alert_ttfb_trend_direction: string; alert_trend_min_samples: number; alert_trend_cooldown_minutes: number;
    alert_trend_require_consecutive: boolean; alert_trend_global_enabled: boolean; alert_trend_global_threshold_factor: number;
  }[]>`
    SELECT id, url, name, is_active, check_interval_seconds, audit_interval_seconds,
           notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
           alert_threshold_ms, alert_sensitivity,
           alert_down_enabled, alert_anomaly_enabled,
           alert_anycast_enabled, alert_zombie_cache_enabled,
           alert_cache_hit_enabled, alert_cache_hit_threshold_pct,
           alert_cache_hit_trend_enabled, alert_cache_hit_trend_threshold_pct, alert_cache_hit_trend_comparators,
           alert_ttfb_trend_enabled, alert_ttfb_trend_threshold_pct, alert_ttfb_trend_comparators,
           alert_ttfb_trend_direction, alert_trend_min_samples, alert_trend_cooldown_minutes,
           alert_trend_require_consecutive, alert_trend_global_enabled, alert_trend_global_threshold_factor
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
      ROUND(AVG(ttfb_ms) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING'))::numeric, 0)::int AS edge_hit_avg_ms,
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
        100.0 * COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING')) / NULLIF(COUNT(*), 0), 1
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
      ROUND(100.0 * COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING')) / NULLIF(COUNT(*), 0), 1) AS cache_hit_pct,
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
      error,
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
        SELECT id, region, alert_type, metric, baseline_ms, actual_ms, deviation_factor, diagnosis, action,
               delta_pct, comparator, scope, created_at
        FROM alerts
        WHERE monitor_id = ${id} AND alert_type = ${filteredAlertType}
        ORDER BY created_at DESC
        LIMIT 100
      `
    : await sql<Alert[]>`
        SELECT id, region, alert_type, metric, baseline_ms, actual_ms, deviation_factor, diagnosis, action,
               delta_pct, comparator, scope, created_at
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
      CASE
        WHEN COUNT(*) FILTER (
          WHERE cache_status IS NOT NULL
            AND cache_status <> 'HIDDEN'
        ) = 0 THEN NULL
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING'))
                 / NULLIF(
                   COUNT(*) FILTER (
                     WHERE cache_status IS NOT NULL
                       AND cache_status <> 'HIDDEN'
                   ),
                   0
                 ),
          0
        )
      END                                                                       AS cache_hit_pct
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

  // Hourly pattern and heatmap queries — only meaningful for ≥ 7d
  const hourlyPattern = range !== '24h'
    ? await sql<HourlyPoint[]>`
        SELECT
          EXTRACT(HOUR FROM time)::int                                           AS hour_of_day,
          ROUND(AVG(ttfb_ms)::numeric, 0)::int                                   AS ttfb_avg,
          ROUND(
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)::numeric, 0
          )::int                                                                  AS ttfb_p95,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE cache_status IN
              ('HIT', 'STALE', 'REVALIDATED', 'UPDATING'))
            / NULLIF(COUNT(*), 0), 0
          )::int                                                                  AS cache_hit_pct,
          COUNT(*)::int                                                           AS sample_count
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - CAST(${dbInterval} AS interval)
          AND ttfb_ms IS NOT NULL
        GROUP BY hour_of_day
        ORDER BY hour_of_day
      `
    : []

  const heatmapRows = range !== '24h'
    ? await sql<HeatmapCell[]>`
        SELECT
          EXTRACT(DOW FROM time)::int                                            AS dow,
          EXTRACT(HOUR FROM time)::int                                           AS hour_of_day,
          ROUND(AVG(ttfb_ms)::numeric, 0)::int                                   AS ttfb_avg,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE cache_status IN
              ('HIT', 'STALE', 'REVALIDATED', 'UPDATING'))
            / NULLIF(COUNT(*), 0), 0
          )::int                                                                  AS cache_hit_pct,
          COUNT(*)::int                                                           AS sample_count
        FROM probe_results
        WHERE monitor_id = ${id}
          AND time > NOW() - CAST(${dbInterval} AS interval)
          AND ttfb_ms IS NOT NULL
        GROUP BY dow, hour_of_day
        ORDER BY dow, hour_of_day
      `
    : []

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

  const validLiveCache = latestProbes.filter(p => p.common_cache_status !== null && p.common_cache_status !== 'HIDDEN');
  const liveHitCount = validLiveCache.filter(p => isCacheHit(p.common_cache_status?.toUpperCase() ?? null)).length;
  const liveGlobalHitRate = validLiveCache.length > 0
    ? Math.round((liveHitCount / validLiveCache.length) * 100)
    : 0;

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
  const liveFreezeStorageKey = `live_updates_frozen_${monitor.id}`
  const latestDataAt = latestProbes.length > 0
    ? Math.max(...latestProbes.map(p => p.last_probe_at ? new Date(p.last_probe_at).getTime() : 0))
    : null;

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
              {/* Active Alerts compact badge */}
              <PremiumTooltip
                content={alerts.length > 0 ? `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''} — click to review` : 'No active alerts'}
                position="top-left"
              >
                <Link
                  href={buildMonitorHref('incidents', range, null, '', monitor.id)}
                  scroll={false}
                  className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0 text-[10px] font-bold uppercase tracking-tight transition-all hover:opacity-80 ${alerts.length > 0
                    ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'border-border bg-white/5 text-zinc-500'
                    }`}
                >
                  <AlertTriangle className={`h-3 w-3 shrink-0 ${alerts.length > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
                  <span>{alerts.length > 0 ? alerts.length : '—'}</span>
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

      {isOffline && (
        <div className="cs-tint-warning p-4 flex items-start gap-4" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="cs-card-wash" />
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-red-400/90">Offline</p>
            <p className="text-sm text-red-300/60 mt-1 leading-relaxed">
              No probes received in the current period. The monitor may be paused or the backend is unreachable.
            </p>
          </div>
        </div>
      )}

      {isDown && (
        <div className="cs-tint-warning p-4 flex items-start gap-4" style={{ borderColor: 'rgba(239, 68, 68, 0.5)', background: 'rgba(239,68,68,0.07)' }}>
          <div className="cs-card-wash" />
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-red-300">Site Down — Unreachable</p>
            <p className="text-sm text-red-300/70 mt-1 leading-relaxed">
              All {latestProbes.length} probed regions are reporting connection failures. Your site is not responding.
            </p>
            {errorLatestProbes[0]?.error && (
              <p className="mt-1.5 font-mono text-[11px] text-red-400/80">{errorLatestProbes[0].error}</p>
            )}
          </div>
        </div>
      )}

      {isDegraded && (
        <div className="cs-tint-warning p-4 flex items-start gap-4" style={{ borderColor: 'rgba(239, 68, 68, 0.35)', background: 'rgba(239,68,68,0.05)' }}>
          <div className="cs-card-wash" />
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-red-400/90">Degraded — Partial Outage</p>
            <p className="text-sm text-red-300/60 mt-1 leading-relaxed">
              {errorLatestProbes.length} of {latestProbes.length} regions are reporting connection failures.
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
                <div className="space-y-8">
                  <section className="space-y-4">
                    <LiveActivityHeader
                      monitorId={monitor.id}
                      freezeStorageKey={liveFreezeStorageKey}
                      latestDataAt={latestDataAt}
                    />

                    {/* LIVE TAB — Summary cards moved here */}
                    {!isCollecting && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* GLOBAL TTFB */}
                        <Link
                          href={buildViewHref('trends', range, monitor.id)}
                          scroll={false}
                          className="cs-card px-5 py-3.5 group hover:ring-1 hover:ring-white/10 transition-all active:scale-[0.98] cursor-pointer block"
                        >
                          <div className="cs-card-wash opacity-40" />
                          <div className="relative z-10 flex items-center justify-between">
                            <PremiumTooltip content="Average global latency from recent probes">
                              <p className="cs-metric-card-label !text-[11px]">Global TTFB</p>
                            </PremiumTooltip>
                            <PremiumTooltip content={validLiveTtfb.length === 0 ? 'No data available' : getTtfbTooltip(liveAvgTtfb, 'global')}>
                              <div className="flex items-center gap-3">
                                {validLiveTtfb.length === 0 ? (
                                  <span className="text-[24px] font-bold tracking-tight leading-none text-zinc-500">—<span className="text-base ml-0.5 text-zinc-600">ms</span></span>
                                ) : (
                                  <>
                                    <span className={`text-[24px] font-bold tracking-tight leading-none ${getTtfbColorClass(liveAvgTtfb, 'global') === 'text-metric-elite' ? 'text-metric-elite' : 'text-white'}`}>{liveAvgTtfb}<span className="text-base ml-0.5 text-zinc-500">ms</span></span>
                                    <Gauge className={`h-5 w-5 stroke-[2.5] ${getTtfbColorClass(liveAvgTtfb, 'global')}`} />
                                  </>
                                )}
                              </div>
                            </PremiumTooltip>
                          </div>
                        </Link>

                        {/* CACHE HIT RATE */}
                        <Link
                          href={buildViewHref('infrastructure', range, monitor.id)}
                          scroll={false}
                          className="cs-card px-5 py-3.5 group hover:ring-1 hover:ring-white/10 transition-all active:scale-[0.98] cursor-pointer block"
                        >
                          <div className="cs-card-wash opacity-60" />
                          <div className="relative z-10 flex items-center justify-between">
                            <PremiumTooltip content="Cache hit rate from recent probes">
                              <p className="cs-metric-card-label !text-[11px]">Cache Hit Rate</p>
                            </PremiumTooltip>
                            <PremiumTooltip content={validLiveCache.length === 0 ? 'No data available' : getCacheTooltip(liveGlobalHitRate, 'global')}>
                              <div className="flex items-center gap-3">
                                {validLiveCache.length === 0 ? (
                                  <span className="text-[24px] font-bold tracking-tight leading-none text-zinc-500">—<span className="text-base ml-0.5 text-zinc-600">%</span></span>
                                ) : (
                                  <>
                                    <span className={`text-[24px] font-bold tracking-tight leading-none ${getCacheColor(liveGlobalHitRate, 'global') === 'text-metric-elite' ? 'text-metric-elite' : 'text-white'}`}>{liveGlobalHitRate}<span className="text-base ml-0.5 text-zinc-500">%</span></span>
                                    <Zap className={`h-5 w-5 fill-current ${getCacheColor(liveGlobalHitRate, 'global')}`} />
                                  </>
                                )}
                              </div>
                            </PremiumTooltip>
                          </div>
                        </Link>
                      </div>
                    )}
                    {latestProbes.length === 0 ? (
                      <p className="text-sm text-zinc-400 italic">Listening for incoming probes...</p>
                    ) : (
                      <div className={MONITOR_TABLE.outerWrapper}>
                        <div className={BRAND_TABLE_SURFACE_GRADIENT} />
                        <div className={MONITOR_TABLE.innerScroll}>
                          <table
                            className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition} ${MONITOR_TABLE.tableDense}`}
                          >
                            <thead>
                              <tr className={MONITOR_TABLE.theadRow}>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="Geographic region" position="top-center" direction="top">Region</PremiumTooltip>
                                </th>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="Edge node location (PoP)" position="top-center" direction="top">Served from</PremiumTooltip>
                                </th>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="CDN or edge provider" position="top-center" direction="top">Served by</PremiumTooltip>
                                </th>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="Cache hit or miss" position="top-center" direction="top">Cache</PremiumTooltip>
                                </th>
                                <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                                  <PremiumTooltip content="Time to first byte" position="top-center" direction="top">TTFB</PremiumTooltip>
                                </th>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="Cache age (seconds)" position="top-center" direction="top">Age</PremiumTooltip>
                                </th>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="HTTP response code" position="top-center" direction="top">Status</PremiumTooltip>
                                </th>
                                <th className="cs-table-compact-th !text-center">
                                  <PremiumTooltip content="Time of last check" position="top-center" direction="top">Sync</PremiumTooltip>
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
                                const servedFromLabel = regionRowServedFromLabel(s.common_served_by)
                                const cdnLabel = regionRowCdnLabelTrimmed(s.common_cdn_provider, s.common_served_by)
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
                                      <PremiumTooltip content={regionDescriptions[s.region] ?? s.region} position="top-left">
                                        {regionLabels[s.region] ?? s.region}
                                      </PremiumTooltip>
                                    </td>
                                    <td className="cs-table-compact-td text-center">
                                      {servedFromLabel ? (
                                        <PremiumTooltip content={extractPop(s.common_served_by) || 'Unknown Point of Presence'} position="top-left">
                                          <span className="cs-pop-tag uppercase">{servedFromLabel}</span>
                                        </PremiumTooltip>
                                      ) : (
                                        <PremiumTooltip content={TOOLTIP_EDGE_DATA_UNAVAILABLE} position="top-center" direction="top">
                                          <span className="cs-pop-tag max-w-[9rem] truncate">—</span>
                                        </PremiumTooltip>
                                      )}
                                    </td>
                                    <td className="cs-table-compact-td text-center">
                                      {cdnLabel ? (
                                        <PremiumTooltip
                                          content={s.common_served_by ? `Raw served_by: ${s.common_served_by}` : 'No edge hint'}
                                          position="top-center"
                                          direction="top"
                                        >
                                          <span className="cs-pop-tag max-w-[9rem] truncate">{cdnLabel}</span>
                                        </PremiumTooltip>
                                      ) : (
                                        <PremiumTooltip content={TOOLTIP_EDGE_DATA_UNAVAILABLE} position="top-center" direction="top">
                                          <span className="cs-pop-tag max-w-[9rem] truncate">—</span>
                                        </PremiumTooltip>
                                      )}
                                    </td>
                                    <td className="cs-table-compact-td text-center">
                                      {/* Live Activity cache column: badges match min width / padding of Status & Age; slate #475569/#64748b for "Not Reported" = neutral, not failure */}
                                      <PremiumTooltip content={cache.title} position="top-center" direction="top">
                                        {cache.variant === 'hit' && (
                                          <span className="cs-badge-cache-hit">
                                            <Zap className="h-[10px] w-[10px] shrink-0 fill-current" aria-hidden />
                                            {cache.text}
                                          </span>
                                        )}
                                        {cache.variant === 'miss' && (
                                          <span className="cs-badge-cache-miss">{cache.text}</span>
                                        )}
                                        {cache.variant === 'bypass' && (
                                          <span className="cs-badge-cache-bypass">{cache.text}</span>
                                        )}
                                        {cache.variant === 'dynamic' && (
                                          <span className="cs-badge-cache-dynamic">{cache.text}</span>
                                        )}
                                        {cache.variant === 'not_reported' && (
                                          <span className="cs-badge-cache-not-reported">{cache.text}</span>
                                        )}
                                        {cache.variant === 'percent_good' && (
                                          <span className="cs-badge-cache-hit">{cache.text}</span>
                                        )}
                                        {cache.variant === 'percent_warn' && (
                                          <span className="cs-badge-cache-miss">{cache.text}</span>
                                        )}
                                        {cache.variant === 'dash' && (
                                          <span className="cs-badge-cache-dash">{cache.text}</span>
                                        )}
                                      </PremiumTooltip>
                                    </td>
                                    <td className={`${isError ? 'cs-table-compact-td' : ttfbMetricCellClass(s.ttfb_ms)} !px-3 !py-2 text-[13px]`}>
                                      {isError ? (
                                        <PremiumTooltip content={s.error ?? 'Connection error'} position="top-right" direction="top">
                                          <span className="block max-w-[140px] truncate text-[10px] font-bold leading-tight text-red-400">
                                            {s.error ?? 'Connection error'}
                                          </span>
                                        </PremiumTooltip>
                                      ) : (
                                        <PremiumTooltip content="Latency for this check" position="top-right" direction="top"><VisualGlow value={s.ttfb_ms}>{s.ttfb_ms != null ? `${Math.round(s.ttfb_ms)}ms` : '—'}</VisualGlow></PremiumTooltip>
                                      )}
                                    </td>
                                    <td className="cs-table-compact-td text-right">
                                      {age > 0 && ageVisual ? (
                                        <PremiumTooltip content={ageBadgeTitle} position="top-right" direction="top">
                                          <span className={ageVisual.className}>
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
                                              <PremiumTooltip content="Successful request" position="top-right" direction="top"><span className={`cs-badge-flat ${colorClass}`}>{code || '200'}</span></PremiumTooltip>
                                            )}
                                          </div>
                                        )
                                      })()}
                                    </td>
                                    {(() => {
                                      const syncStatus = probeSyncStatus(s.last_probe_at)
                                      const syncColorClass =
                                        syncStatus === 'offline' ? '!text-red-400'
                                          : syncStatus === 'stale' ? '!text-amber-400'
                                            : '!text-zinc-500'
                                      const syncTooltip =
                                        syncStatus === 'offline'
                                          ? `Last probe on ${new Date(s.last_probe_at!).toLocaleDateString()} — no data today`
                                          : syncStatus === 'stale'
                                            ? `Last probe over 1h ago at ${new Date(s.last_probe_at!).toLocaleString()}`
                                            : `Probe synchronized at ${new Date(s.last_probe_at!).toLocaleString()}`
                                      return (
                                        <td className={`cs-table-compact-td text-right !text-[10px] tabular-nums ${syncColorClass}`}>
                                          {s.last_probe_at ? (
                                            <PremiumTooltip content={syncTooltip} position="top-right" direction="top">
                                              {new Date(s.last_probe_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </PremiumTooltip>
                                          ) : '—'}
                                        </td>
                                      )
                                    })()}
                                    {process.env.NODE_ENV === 'development' && (
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <span className="text-[9px] font-bold !text-zinc-500 font-mono bg-zinc-100 dark:bg-zinc-800/50 px-1 py-0.5 rounded">
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

              {activeView === 'performance' && (
                <div className="space-y-6">
                  <section className="space-y-4">
                    <ViewSectionHeader title="Period Performance">
                      {/* Time range selector */}
                      <div className="flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 px-1.5 border border-zinc-200 dark:border-white/10">
                        {['24h', '7d', '30d'].map((r) => (
                          <Link
                            key={r}
                            href={buildViewHref('performance', r)}
                            className={`px-3 h-6 flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${range === r
                              ? 'bg-zinc-100 text-zinc-900 shadow-lg shadow-white/5 ring-1 ring-white/10'
                              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                              }`}
                          >
                            {r}
                          </Link>
                        ))}
                      </div>
                    </ViewSectionHeader>

                    {!isCollecting && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* GLOBAL TTFB */}
                        <Link
                          href={buildViewHref('trends', range, monitor.id)}
                          scroll={false}
                          className="cs-card px-5 py-3.5 group hover:ring-1 hover:ring-white/10 transition-all active:scale-[0.98] cursor-pointer block"
                        >
                          <div className="cs-card-wash opacity-40" />
                          <div className="relative z-10 flex items-center justify-between">
                            <PremiumTooltip content={`Global average Time to First Byte during the last ${range}`}>
                              <p className="cs-metric-card-label !text-[11px]">Global TTFB</p>
                            </PremiumTooltip>
                            <PremiumTooltip content={avgTtfb === 0 ? 'No data available' : getTtfbTooltip(avgTtfb, 'global')}>
                              <div className="flex items-center gap-3">
                                {avgTtfb === 0 ? (
                                  <span className="text-[24px] font-bold tracking-tight leading-none text-zinc-500">—<span className="text-base ml-0.5 text-zinc-600">ms</span></span>
                                ) : (
                                  <>
                                    <span className={`text-[24px] font-bold tracking-tight leading-none ${getTtfbColorClass(avgTtfb, 'global') === 'text-metric-elite' ? 'text-metric-elite' : 'text-white'}`}>{avgTtfb}<span className="text-base ml-0.5 text-zinc-500">ms</span></span>
                                    <Gauge className={`h-5 w-5 stroke-[2.5] ${getTtfbColorClass(avgTtfb, 'global')}`} />
                                  </>
                                )}
                              </div>
                            </PremiumTooltip>
                          </div>
                        </Link>

                        {/* CACHE HIT RATE */}
                        <Link
                          href={buildViewHref('infrastructure', range, monitor.id)}
                          scroll={false}
                          className="cs-card px-5 py-3.5 group hover:ring-1 hover:ring-white/10 transition-all active:scale-[0.98] cursor-pointer block"
                        >
                          <div className="cs-card-wash opacity-60" />
                          <div className="relative z-10 flex items-center justify-between">
                            <PremiumTooltip content={`Percentage of requests successfully served from CDN edge cache during the last ${range}`}>
                              <p className="cs-metric-card-label !text-[11px]">Cache Hit Rate</p>
                            </PremiumTooltip>
                            <PremiumTooltip content={globalHitRate === 0 ? 'No data available' : getCacheTooltip(globalHitRate, 'global')}>
                              <div className="flex items-center gap-3">
                                {globalHitRate === 0 ? (
                                  <span className="text-[24px] font-bold tracking-tight leading-none text-zinc-500">—<span className="text-base ml-0.5 text-zinc-600">%</span></span>
                                ) : (
                                  <>
                                    <span className={`text-[24px] font-bold tracking-tight leading-none ${getCacheColor(globalHitRate, 'global') === 'text-metric-elite' ? 'text-metric-elite' : 'text-white'}`}>{globalHitRate}<span className="text-base ml-0.5 text-zinc-500">%</span></span>
                                    <Zap className={`h-5 w-5 fill-current ${getCacheColor(globalHitRate, 'global')}`} />
                                  </>
                                )}
                              </div>
                            </PremiumTooltip>
                          </div>
                        </Link>
                      </div>
                    )}
                    {stats.length === 0 ? (
                      <p className="text-sm text-zinc-400">Compiling historical insights...</p>
                    ) : (
                      <div className={MONITOR_TABLE.outerWrapper}>
                        <div className={BRAND_TABLE_SURFACE_GRADIENT} />
                        <div className={MONITOR_TABLE.innerScroll}>
                          <table
                            className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition} ${MONITOR_TABLE.tableDense}`}
                          >
                            <thead>
                              {(() => {
                                const hasEdgeData = stats.some(s => s.edge_hit_avg_ms !== null);
                                const hasOriginData = stats.some(s => s.origin_miss_avg_ms !== null);
                                const showSplitTtfb = hasEdgeData || hasOriginData;

                                return (
                                  <tr className={MONITOR_TABLE.theadRow}>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Geographic region" position="top-center" direction="top">Region</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Edge node location (PoP)" position="top-center" direction="top">Served from</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="CDN or edge provider" position="top-center" direction="top">Served by</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Cache efficiency" position="top-center" direction="top">Cache</PremiumTooltip>
                                    </th>
                                    {showSplitTtfb ? (
                                      <>
                                        <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                                          <PremiumTooltip content="Latency when served from cache" position="top-center" direction="top">Edge TTFB</PremiumTooltip>
                                        </th>
                                        <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER_ORIGIN}`}>
                                          <PremiumTooltip content="Latency when bypassing cache" position="top-center" direction="top">Origin TTFB</PremiumTooltip>
                                        </th>
                                        <th className={`cs-table-compact-th !text-center border-l border-white/5 ${TH_TTFB_HEADER}`}>
                                          <PremiumTooltip content="Average latency" position="top-center" direction="top">Avg TTFB</PremiumTooltip>
                                        </th>
                                      </>
                                    ) : (
                                      <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                                        <PremiumTooltip content="Average latency" position="top-center" direction="top">Avg TTFB</PremiumTooltip>
                                      </th>
                                    )}

                                    <th className="cs-table-compact-th !text-center whitespace-nowrap">
                                      <PremiumTooltip content="Minimum and maximum latency" position="top-center" direction="top">Min / Max</PremiumTooltip>
                                    </th>
                                    <th className="cs-table-compact-th !text-center">
                                      <PremiumTooltip content="Percentage of successful probes" position="top-center" direction="top">Uptime</PremiumTooltip>
                                    </th>
                                  </tr>
                                )
                              })()}
                            </thead>
                            <tbody>
                              {(() => {
                                const hasEdgeData = stats.some(st => st.edge_hit_avg_ms !== null);
                                const hasOriginData = stats.some(st => st.origin_miss_avg_ms !== null);
                                const showSplitTtfb = hasEdgeData || hasOriginData;

                                return stats.map((s) => {
                                  const servedFromLabel = regionRowServedFromLabel(s.common_served_by)
                                  const cdnLabel = regionRowCdnLabelTrimmed(s.common_cdn_provider, s.common_served_by)
                                  return (
                                    <tr
                                      key={s.region}
                                      className={MONITOR_TABLE.tbodyRow}
                                    >
                                      <td className="cs-table-compact-td">
                                        <PremiumTooltip content={regionDescriptions[s.region] ?? s.region} position="top-left">
                                          <span className="font-bold text-zinc-200">
                                            {regionLabels[s.region] ?? s.region}
                                          </span>
                                        </PremiumTooltip>
                                      </td>
                                      <td className="cs-table-compact-td text-center">
                                        {servedFromLabel ? (
                                          <PremiumTooltip content={extractPop(s.common_served_by) ? `PoP code detected: ${extractPop(s.common_served_by)}` : 'Location inferred from monitoring region'} position="top-left">
                                            <span className="cs-pop-tag whitespace-nowrap uppercase">{servedFromLabel}</span>
                                          </PremiumTooltip>
                                        ) : (
                                          <PremiumTooltip content={TOOLTIP_EDGE_DATA_UNAVAILABLE} position="top-center" direction="top">
                                            <span className="cs-pop-tag max-w-[9rem] truncate">—</span>
                                          </PremiumTooltip>
                                        )}
                                      </td>
                                      <td className="cs-table-compact-td text-center">
                                        {cdnLabel ? (
                                          <PremiumTooltip content={s.common_served_by ? `served_by: ${s.common_served_by}` : 'No edge hint'} position="top-center" direction="top">
                                            <span className="cs-pop-tag max-w-[9rem] truncate">{cdnLabel}</span>
                                          </PremiumTooltip>
                                        ) : (
                                          <PremiumTooltip content={TOOLTIP_EDGE_DATA_UNAVAILABLE} position="top-center" direction="top">
                                            <span className="cs-pop-tag max-w-[9rem] truncate">—</span>
                                          </PremiumTooltip>
                                        )}
                                      </td>
                                      <td className="cs-table-compact-td text-center">
                                        {s.cache_hit_pct != null ? (
                                          <PremiumTooltip content={`${s.cache_hit_pct}% of requests were served from edge cache`} position="top-center" direction="top">
                                            {Math.round(s.cache_hit_pct) >= 95 ? (
                                              <span className="cs-badge-cache-hit">
                                                <Zap className="h-[10px] w-[10px] shrink-0 fill-current" aria-hidden />
                                                {Math.round(s.cache_hit_pct)}%
                                              </span>
                                            ) : Math.round(s.cache_hit_pct) >= 90 ? (
                                              <span className="cs-badge-cache-hit">{Math.round(s.cache_hit_pct)}%</span>
                                            ) : Math.round(s.cache_hit_pct) >= 50 ? (
                                              <span className="cs-badge-cache-miss">{Math.round(s.cache_hit_pct)}%</span>
                                            ) : (
                                              <span className="cs-badge-cache-hit-rate-low">{Math.round(s.cache_hit_pct)}%</span>
                                            )}
                                          </PremiumTooltip>
                                        ) : (
                                          <span className="cs-badge-cache-dash">—</span>
                                        )}
                                      </td>

                                      {showSplitTtfb ? (
                                        <>
                                          <td className={`${edgeTtfbMetricCellClass(s.edge_hit_avg_ms)} !text-[13px] !py-2`}>
                                            <PremiumTooltip content="Average cache latency" position="top-right" direction="top">{s.edge_hit_avg_ms != null ? `${Math.round(s.edge_hit_avg_ms)}ms` : '—'}</PremiumTooltip>
                                          </td>
                                          <td className={`${originTtfbMetricCellClass(s.origin_miss_avg_ms)} !text-[13px] !py-2`}>
                                            <PremiumTooltip content="Average origin latency" position="top-right" direction="top">{s.origin_miss_avg_ms != null ? `${Math.round(s.origin_miss_avg_ms)}ms` : '—'}</PremiumTooltip>
                                          </td>
                                          <td className={`${ttfbMetricCellClass(s.ttfb_avg_ms)} !text-[13px] !py-2 border-l border-white/5`}>
                                            <PremiumTooltip content="Average latency for this region" position="top-right" direction="top">{s.ttfb_avg_ms != null ? `${Math.round(s.ttfb_avg_ms)}ms` : '—'}</PremiumTooltip>
                                          </td>
                                        </>
                                      ) : (
                                        <td className={`${ttfbMetricCellClass(s.ttfb_avg_ms)} !text-[13px] !py-2`}>
                                          {s.ttfb_avg_ms != null ? `${Math.round(s.ttfb_avg_ms)}ms` : '—'}
                                        </td>
                                      )}


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

                </div>
              )}

              {activeView === 'trends' && (
                <div className="space-y-6">
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

                  {spikes.length > 0 && (
                    <section className="space-y-4">
                      <ViewSectionHeader title={`Recent performance spikes — ${range === '7d' ? 'last 7 days' : range === '30d' ? 'last 30 days' : range === '90d' ? 'last 90 days' : 'last 24h'}`} />
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
                                <span className="text-zinc-400 line-through decoration-zinc-700/30">{spike.prev_avg}ms</span>
                                <span className="text-zinc-500/30">→</span>
                                <span className="font-bold text-red-400">{spike.ttfb_avg}ms</span>
                              </div>
                              <div className="px-2 py-0.5 rounded text-[9px] font-black min-w-[65px] text-center bg-red-500/10 text-red-400 ring-1 ring-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.1)]">
                                +{spike.spike_ms}ms
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-zinc-400 italic">Detected when TTFB increased by more than 50% between consecutive 30-minute windows.</p>
                    </section>
                  )}

                  {weekTrend.length > 0 && (
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

                  {range !== '24h' && hourlyPattern.length > 0 && (
                    <section className="space-y-4">
                      <ViewSectionHeader title="Hourly performance pattern" />
                      <HourlyPatternChart data={hourlyPattern} range={range} />
                    </section>
                  )}

                  {range !== '24h' && heatmapRows.length > 0 && (
                    <section className="space-y-4">
                      <ViewSectionHeader title="Weekly performance pattern" />
                      <TtfbHeatmap data={heatmapRows} />
                    </section>
                  )}
                </div>
              )}

              {activeView === 'diagnostics' && (
                <div className="space-y-4">
                  <ViewSectionHeader title="Performance Diagnostics" showDot={false} />
                  {waterfallProbes.length > 0 ? (
                    <ProbeWaterfall probes={waterfallProbes} regionLabels={regionLabels} />
                  ) : (
                    <p className="text-sm text-zinc-400 italic">No diagnostic data available yet.</p>
                  )}
                </div>
              )}

              {activeView === 'infrastructure' && (
                <div className="space-y-8">
                  <BypassAudit data={hourlyBypass} regionLabels={regionLabels} />
                </div>
              )}
            </div>
          )}


          {activeTab === 'settings' && (
            <div className="space-y-4">
              <ViewSectionHeader title="Monitor configuration" showDot={false} />
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
                alertThresholdMs={monitor.alert_threshold_ms}
                alertSensitivity={monitor.alert_sensitivity}
                alertDownEnabled={monitor.alert_down_enabled}
                alertAnomalyEnabled={monitor.alert_anomaly_enabled}
                alertAnycastEnabled={monitor.alert_anycast_enabled}
                alertZombieCacheEnabled={monitor.alert_zombie_cache_enabled}
                alertCacheHitEnabled={monitor.alert_cache_hit_enabled}
                alertCacheHitThresholdPct={monitor.alert_cache_hit_threshold_pct}
                alertCacheHitTrendEnabled={monitor.alert_cache_hit_trend_enabled}
                alertCacheHitTrendThresholdPct={monitor.alert_cache_hit_trend_threshold_pct}
                alertCacheHitTrendComparators={(monitor.alert_cache_hit_trend_comparators ?? ['prev_hour']) as TrendComparator[]}
                alertTtfbTrendEnabled={monitor.alert_ttfb_trend_enabled}
                alertTtfbTrendThresholdPct={monitor.alert_ttfb_trend_threshold_pct}
                alertTtfbTrendComparators={(monitor.alert_ttfb_trend_comparators ?? ['prev_hour']) as TrendComparator[]}
                alertTtfbTrendDirection={(monitor.alert_ttfb_trend_direction ?? 'worsening') as 'worsening' | 'both'}
                alertTrendMinSamples={monitor.alert_trend_min_samples}
                alertTrendCooldownMinutes={monitor.alert_trend_cooldown_minutes}
                alertTrendRequireConsecutive={monitor.alert_trend_require_consecutive}
                alertTrendGlobalEnabled={monitor.alert_trend_global_enabled}
                alertTrendGlobalThresholdFactor={monitor.alert_trend_global_threshold_factor}
              />
            </div>
          )}


          {activeTab === 'security' && (
            <div className="space-y-4">
              <ViewSectionHeader title="Security Headers Audit" showDot={false} />

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
                                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 ${urgent
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
                        <div className="grid gap-4 md:grid-cols-2">
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
            </div>
          )}

          {activeTab === 'incidents' && (
            <section className="space-y-4">
              <ViewSectionHeader title="Active Incidents & Alerts" showDot={false} />
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
                            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Threshold / Baseline</th>
                            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Observed</th>
                            <th className="px-4 py-2.5 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Severity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alerts.map((alert) => {
                            const df = alert.deviation_factor ?? 0
                            const severity = df > 4 ? 'CRITICAL' : df > 2 ? 'WARNING' : 'INFO'
                            const severityColor = severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-zinc-500 border border-white/10'
                            const alertTypeIcon = alert.alert_type === 'down'
                              ? <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                              : alert.alert_type === 'anomaly'
                                ? <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                                : <AlertCircle className="w-3 h-3 text-zinc-400 shrink-0" />

                            return (
                              <Fragment key={alert.id}>
                                <tr className={`${MONITOR_TABLE.tbodyRow} ${alert.diagnosis ? 'border-b-0' : ''}`}>
                                  <td className="px-4 py-3">
                                    <span className="text-[11px] text-zinc-500 font-medium tabular-nums">
                                      {new Date(alert.created_at).toLocaleString('en-US', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                      {regionLabels[alert.region] ?? alert.region}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      {alertTypeIcon}
                                      <span className="text-[11px] font-bold uppercase tracking-tight text-zinc-600 dark:text-zinc-400">
                                        {ALERT_TYPE_LABELS[alert.alert_type as AlertType] ?? alert.alert_type.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <code className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                                      {alert.metric}
                                    </code>
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-400">
                                    {alert.delta_pct != null
                                      ? <span className={alert.delta_pct < 0 ? 'text-red-400' : 'text-amber-400'}>{alert.delta_pct > 0 ? '+' : ''}{alert.delta_pct.toFixed(1)}%</span>
                                      : alert.alert_type === 'cache_hit_low'
                                        ? (alert.baseline_ms != null ? `${alert.baseline_ms.toFixed(0)}%` : '—')
                                        : formatMs(alert.baseline_ms)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                                    {alert.comparator != null
                                      ? <span className="text-[10px] font-normal text-zinc-500 uppercase tracking-tight">{alert.comparator.replace(/_/g, ' ')}</span>
                                      : alert.alert_type === 'cache_hit_low'
                                        ? (alert.actual_ms != null ? `${alert.actual_ms.toFixed(1)}%` : '—')
                                        : formatMs(alert.actual_ms)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black tracking-tighter ${severityColor}`}>
                                      {alert.deviation_factor != null ? `${alert.deviation_factor.toFixed(1)}×` : severity}
                                    </span>
                                  </td>
                                </tr>
                                {(alert.diagnosis || alert.action) && (
                                  <tr className="border-b border-white/5">
                                    <td colSpan={7} className="px-4 pb-3 pt-0">
                                      <div className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2 space-y-1">
                                        {alert.diagnosis && (
                                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                                            <span className="text-zinc-600 font-bold uppercase tracking-tight text-[9px] mr-2">Cause</span>
                                            {alert.diagnosis}
                                          </p>
                                        )}
                                        {alert.action && (
                                          <p className="text-[11px] text-[var(--brand-primary)]/70 leading-relaxed">
                                            <span className="text-zinc-600 font-bold uppercase tracking-tight text-[9px] mr-2">Fix</span>
                                            {alert.action}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
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
