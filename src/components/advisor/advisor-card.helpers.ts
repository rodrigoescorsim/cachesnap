import type { Monitor } from '@/types/monitor'
import { monitorHealthScore, monitorCacheHitIsComparable } from '@/types/monitor'
import { MONITOR_TTFB, MONITOR_CACHE } from '@/lib/thresholds'
import { getCacheDisplayLabel } from '@/lib/cache-utils'
import { buildMonitorHref, buildViewHref } from '@/app/dashboard/monitors/[id]/monitor-href'

// ─── Public types ─────────────────────────────────────────────────────────────

export type AdvisorSeverity = 'critical' | 'warning' | 'good'

export type AdvisorAction = {
  label: string
  href?: string
  tooltip?: string
}

export type AdvisorState = {
  severity: AdvisorSeverity
  headline: string
  body: string
  recommendation?: string
  /** Max 3 actions. */
  actions: AdvisorAction[]
}

// ─── Portfolio advisor ────────────────────────────────────────────────────────

/** Minimum active monitors before the advisor renders. */
const PORTFOLIO_MIN_MONITORS = 3

/**
 * Derives a single advisory summary for the Monitors Overview and Insights pages.
 * Returns null when there are too few monitors to say anything meaningful.
 */
export function derivePortfolioAdvisor(monitors: Monitor[]): AdvisorState | null {
  const active = monitors.filter(m => m.status === 'active')
  if (active.length < PORTFOLIO_MIN_MONITORS) return null

  const down = active.filter(m => m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount)
  // AD14: Origin Health (5xx errors or 4xx spikes)
  const originError = active.filter(m => !down.includes(m) && (m.error5xxCount > 0 || m.error4xxCount > 0))
  const noHeader = active.filter(m => getCacheDisplayLabel(m.cacheStatusCurrent) === 'NO HEADER')
  const degraded = active.filter(m => !originError.includes(m) && (
    m.errorRegionCount > 0 ||
    m.ttfbCurrent >= MONITOR_TTFB.FAST ||
    (monitorCacheHitIsComparable(m) && m.cacheHitCurrent !== null && m.cacheHitCurrent < MONITOR_CACHE.GOOD)
  ))

  // ── Critical: at least one monitor fully down or origin failing ───────────
  if (down.length > 0 || originError.some(m => m.error5xxCount > 0)) {
    const worst = down.length > 0
      ? [...down].sort((a, b) => b.errorRegionCount - a.errorRegionCount)[0]
      : [...originError].sort((a, b) => b.error5xxCount - a.error5xxCount)[0]

    const actions: AdvisorAction[] = []
    if (down.length > 0) {
      actions.push({ 
        label: `Monitors DOWN (${down.length})`, 
        href: '/monitors?filter=down',
        tooltip: 'Shows monitors that are currently unreachable from all probe regions.'
      })
    }
    if (noHeader.length > 0) {
      actions.push({ 
        label: `Missing Cache Headers (${noHeader.length})`, 
        href: '/monitors?filter=missing-cache-headers',
        tooltip: 'Shows monitors where no CDN cache status header (HIT/MISS/etc.) was detected.'
      })
    }
    if (degraded.length > 0) {
      actions.push({ 
        label: `Degraded Monitors (${degraded.length})`, 
        href: '/monitors?filter=degraded',
        tooltip: 'Shows monitors with latency issues, partial outages, or low cache hit rates.'
      })
    }

    const secondarySuffix = (degraded.length + noHeader.length > 0)
      ? ` • ${degraded.length + noHeader.length} issues in total`
      : ''

    let headline = `${down.length} monitor${down.length > 1 ? 's' : ''} DOWN`
    if (down.length === 0 && originError.length > 0) {
      const failingCount = originError.filter(m => m.error5xxCount > 0).length
      headline = `Origin Health: ${failingCount} monitor${failingCount > 1 ? 's' : ''} failing`
    }

    const host = hostname(worst.url)
    const bodyParts: string[] = []
    if (down.includes(worst)) {
      bodyParts.push(`${host} is unreachable across all ${worst.totalRegionCount} regions.`)
    } else {
      bodyParts.push(`${host} is returning 5xx errors from the origin server.`)
    }

    if (noHeader.length > 0) {
      bodyParts.push(`${noHeader.length} site${noHeader.length > 1 ? 's' : ''} without cache headers detected.`)
    }

    return {
      severity: 'critical',
      headline: headline + secondarySuffix,
      body: bodyParts.join(' '),
      actions: actions.slice(0, 3),
    }
  }

  // ── Warning: degraded, origin 4xx, or missing cache headers ───────────────
  if (degraded.length > 0 || originError.length > 0 || noHeader.length > 0) {
    const worstDegraded = [...degraded, ...originError].sort((a, b) => {
      const aVal = a.error5xxCount * 1000 + a.ttfbCurrent
      const bVal = b.error5xxCount * 1000 + b.ttfbCurrent
      return bVal - aVal
    })[0]
    const actions: AdvisorAction[] = []

    if (noHeader.length > 0) {
      actions.push({ 
        label: `Missing Cache Headers (${noHeader.length})`, 
        href: '/monitors?filter=missing-cache-headers',
        tooltip: 'Shows monitors where no CDN cache status header was detected.'
      })
    }
    if (degraded.length > 0) {
      actions.push({ 
        label: `Degraded Monitors (${degraded.length})`, 
        href: '/monitors?filter=degraded',
        tooltip: 'Shows monitors with latency issues or low cache hit rates.'
      })
    }
    if (worstDegraded && actions.length < 3) {
      const host = hostname(worstDegraded.url)
      actions.push({
        label: `Inspect ${host}`,
        href: buildViewHref('performance', '24h', worstDegraded.id),
        tooltip: `View detailed performance breakdown for ${host}.`
      })
    }

    const parts: string[] = []
    if (originError.length > 0) parts.push(`${originError.length} with origin errors`)
    if (degraded.length > 0) parts.push(`${degraded.length} degraded`)
    if (noHeader.length > 0) parts.push(`${noHeader.length} without cache headers`)

    const body = worstDegraded
      ? buildDegradedBody(worstDegraded)
      : `${noHeader.length} site${noHeader.length > 1 ? 's are' : ' is'} missing Cache-Control headers.`

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body,
      actions: actions.slice(0, 3),
    }
  }

  // ── Good: everything healthy ──────────────────────────────────────────────
  const avgTtfb = Math.round(active.reduce((s, m) => s + m.ttfbCurrent, 0) / active.length)
  const withCache = active.filter(m => monitorCacheHitIsComparable(m) && m.cacheHitCurrent !== null)
  const avgCache = withCache.length > 0
    ? Math.round(withCache.reduce((s, m) => s + m.cacheHitCurrent!, 0) / withCache.length)
    : null

  return {
    severity: 'good',
    headline: `${active.length} monitors healthy`,
    body: `Avg TTFB ${avgTtfb}ms${avgCache !== null ? ` · ${avgCache}% cache hit` : ''}. No issues detected.`,
    actions: [],
  }
}

function buildDegradedBody(m: Monitor): string {
  const host = hostname(m.url)
  if (m.error5xxCount > 0) return `${host} is reporting 5xx errors from the origin server.`
  if (m.error4xxCount > 0) return `${host} is reporting unusual 4xx status codes from origin.`

  const cacheNote = monitorCacheHitIsComparable(m) && m.cacheHitCurrent !== null && m.cacheHitCurrent < MONITOR_CACHE.GOOD
    ? ` · ${m.cacheHitCurrent}% cache hit`
    : ''
  const regionNote = m.errorRegionCount > 0
    ? ` ${m.errorRegionCount} of ${m.totalRegionCount} regions failing.`
    : ''
  return `${host}: ${m.ttfbCurrent}ms TTFB${cacheNote}.${regionNote}`
}

// ─── Monitor detail — live view ──────────────────────────────────────────────

export type MonitorDetailLiveInput = {
  monitorId: string
  url: string
  liveAvgTtfb: number
  /** Avg TTFB over the selected period — used to give a concrete before/after. */
  periodAvgTtfb: number
  liveGlobalHitRate: number
  /** True only when cache-status headers were actually present in live probes. */
  hasLiveCacheData: boolean
  liveDominantStatus: string | null
  liveAvgEdgeMs: number
  liveAvgOriginMs: number
  errorRegionCount: number
  slowRegionCount: number
  totalRegionCount: number
  /** (liveAvgTtfb − periodAvgTtfb) / periodAvgTtfb × 100. Positive = worse. 0 when no baseline. */
  ttfbVsPeriodPct: number
}

/**
 * Derives a compact advisory banner for the Live (real-time) view inside a monitor detail page.
 * Callers must suppress this when the existing isDown / isDegraded banners are already visible.
 * Returns null when the monitor is healthy — the live data is already self-explanatory.
 */
export function deriveMonitorDetailLiveAdvisor(input: MonitorDetailLiveInput): AdvisorState | null {
  const { monitorId, url, liveAvgTtfb, periodAvgTtfb, liveGlobalHitRate, hasLiveCacheData,
    liveDominantStatus, liveAvgEdgeMs, liveAvgOriginMs,
    errorRegionCount, slowRegionCount, totalRegionCount, ttfbVsPeriodPct } = input
  const host = hostname(url)

  // Full outage — caller should already show the isDown banner; skip here.
  if (totalRegionCount > 0 && errorRegionCount >= totalRegionCount) return null

  // Partial outage — caller should already show the isDegraded banner; skip here.
  if (errorRegionCount > 0) return null

  // Critical TTFB
  if (liveAvgTtfb > MONITOR_TTFB.SLOW) {
    const trendNote = ttfbVsPeriodPct > 0 && periodAvgTtfb > 0
      ? ` Up from ~${periodAvgTtfb}ms period avg (+${ttfbVsPeriodPct}%).`
      : ''
    
    let recommendation = "Review origin server capacity and database query performance."
    if (input.liveAvgOriginMs > input.liveAvgEdgeMs * 2) {
      recommendation = "Origin latency is dominant. Optimize backend processing or database queries."
    } else if (input.liveAvgEdgeMs > 200) {
      recommendation = "Edge latency is elevated. Check for large response sizes or TLS handshake overhead."
    }

    return {
      severity: 'critical',
      headline: `High latency: ${liveAvgTtfb}ms`,
      body: `Currently at ${liveAvgTtfb}ms — above the ${MONITOR_TTFB.SLOW}ms threshold.${trendNote}`,
      recommendation,
      actions: [
        { label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', '24h', monitorId) },
        { label: `View ${host} Breakdown`, href: buildViewHref('diagnostics', '24h', monitorId) },
      ],
    }
  }

  // Elevated TTFB trending worse vs period avg
  if (liveAvgTtfb > MONITOR_TTFB.FAST && ttfbVsPeriodPct > 20) {
    const baseline = periodAvgTtfb > 0 ? `~${periodAvgTtfb}ms` : 'period avg'
    return {
      severity: 'warning',
      headline: `TTFB up ${ttfbVsPeriodPct}% vs period avg`,
      body: `${host} is at ${liveAvgTtfb}ms, up from ${baseline}. Check for a recent deploy or config change.`,
      recommendation: "Inspect recent code deployments or origin server load spikes.",
      actions: [{ label: `Analyze ${host} Trends`, href: buildViewHref('trends', '24h', monitorId) }],
    }
  }

  // Elevated TTFB trending worse vs period avg
  if (liveAvgTtfb > MONITOR_TTFB.FAST && ttfbVsPeriodPct > 20) {
    const baseline = periodAvgTtfb > 0 ? `~${periodAvgTtfb}ms` : 'period avg'
    return {
      severity: 'warning',
      headline: `TTFB up ${ttfbVsPeriodPct}% vs period avg`,
      body: `${host} is at ${liveAvgTtfb}ms, up from ${baseline}. Check for a recent deploy or config change.`,
      actions: [{ label: 'View Trends', href: buildViewHref('trends', '24h', monitorId) }],
    }
  }

  // Low cache hit
  if (hasLiveCacheData && liveGlobalHitRate < MONITOR_CACHE.LOW) {
    const originPct = 100 - liveGlobalHitRate
    let recommendation = "Review your Cache-Control headers to improve performance."
    
    const status = liveDominantStatus.toUpperCase()
    if (status === 'DYNAMIC') {
      recommendation = "Responses are marked as DYNAMIC. Ensure your backend isn't sending 'no-cache' for static assets."
    } else if (status === 'BYPASS') {
      recommendation = "Cache is being bypassed. Check for 'Authorization' headers or specific cookies forcing origin fetch."
    } else if (status === 'NO HEADER' || status === 'HIDDEN') {
      recommendation = "No cache status reported. Add 'Cache-Control' or 'CDN-Cache-Control' to enable edge caching."
    }

    return {
      severity: liveGlobalHitRate < 30 ? 'critical' : 'warning',
      headline: `Low cache hit: ${liveGlobalHitRate}%`,
      body: `Origin load is high: ${originPct}% of requests are bypassing edge cache.`,
      recommendation,
      actions: [
        { label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', '24h', monitorId) },
        { label: `Analyze ${host} Performance`, href: buildViewHref('performance', '24h', monitorId) },
      ],
    }
  }

  if (slowRegionCount > 0) {
    return {
      severity: 'warning',
      headline: `${slowRegionCount} slow region${slowRegionCount > 1 ? 's' : ''}`,
      body: `${slowRegionCount} region${slowRegionCount > 1 ? 's are' : ' is'} above 300ms TTFB. Origin may be geographically distant from these regions.`,
      recommendation: "Consider using a CDN with better regional coverage or a global edge network.",
      actions: [
        { label: `View ${host} Breakdown`, href: buildViewHref('diagnostics', '24h', monitorId) },
        { label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', '24h', monitorId) },
      ],
    }
  }

  if (slowRegionCount > 0) {
    return {
      severity: 'warning',
      headline: `${slowRegionCount} slow region${slowRegionCount > 1 ? 's' : ''}`,
      body: `${slowRegionCount} region${slowRegionCount > 1 ? 's are' : ' is'} above 300ms TTFB. Origin may be geographically distant from these regions.`,
      actions: [
        { label: 'View Breakdown', href: buildViewHref('diagnostics', '24h', monitorId) },
        { label: 'Check Edge Audit', href: buildViewHref('infrastructure', '24h', monitorId) },
      ],
    }
  }

  return null
}

// ─── Monitor detail — performance view ───────────────────────────────────────

export type MonitorPerformancePeriodInput = {
  monitorId: string
  url: string
  range: string
  avgTtfb: number
  prevAvgTtfb: number
  globalHitRate: number
  prevGlobalHitRate: number
  hasHistory: boolean
  /** Worst region by TTFB change percentage. */
  worstRegion: { label: string; changePct: number } | null
  spikeCount: number
}

/**
 * Derives a summary advisory for the Performance (period) view inside a monitor detail page.
 * Returns null when there is no historical baseline to compare against or change is minor.
 */
export function deriveMonitorPerformancePeriodAdvisor(input: MonitorPerformancePeriodInput): AdvisorState | null {
  const { monitorId, url, range, avgTtfb, prevAvgTtfb, globalHitRate, prevGlobalHitRate,
    hasHistory, worstRegion, spikeCount } = input

  if (!hasHistory || prevAvgTtfb === 0) return null

  const ttfbChangePct = Math.round(((avgTtfb - prevAvgTtfb) / prevAvgTtfb) * 100)
  const cacheChangePp  = globalHitRate - prevGlobalHitRate
  const host = hostname(url)

  // ── Critical: significant TTFB regression ────────────────────────────────
  if (ttfbChangePct > 30) {
    const regionNote = worstRegion ? ` ${worstRegion.label} is the worst region (+${worstRegion.changePct}%).` : ''
    return {
      severity: 'critical',
      headline: `TTFB +${ttfbChangePct}% vs previous ${range}`,
      body: `${host} averaged ${avgTtfb}ms, up from ${prevAvgTtfb}ms.${regionNote}`,
      actions: [
        { label: `Analyze ${host} Trends`, href: buildViewHref('trends', range, monitorId) },
        { label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', range, monitorId) },
      ],
    }
  }

  // ── Warning: moderate regression or cache drop ────────────────────────────
  if (ttfbChangePct > 10 || cacheChangePp < -10) {
    const parts: string[] = []
    if (ttfbChangePct > 10) parts.push(`TTFB +${ttfbChangePct}% vs previous ${range}`)

    if (cacheChangePp < -10) parts.push(`cache hit ${cacheChangePp}pp`)

    const bodyParts: string[] = [`${host}: ${avgTtfb}ms TTFB (was ${prevAvgTtfb}ms).`]
    if (worstRegion && ttfbChangePct > 10) bodyParts.push(`${worstRegion.label} regressed most (+${worstRegion.changePct}%).`)
    if (spikeCount > 0) bodyParts.push(`${spikeCount} spike${spikeCount > 1 ? 's' : ''} detected.`)

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body: bodyParts.join(' '),
      recommendation: "Monitor for continued degradation. Check recent config changes.",
      actions: [{ label: `Analyze ${host} Trends`, href: buildViewHref('trends', range, monitorId) }],
    }
  }

  // ── Good: notable improvement ─────────────────────────────────────────────
  if (ttfbChangePct < -10 || cacheChangePp > 10) {
    const parts: string[] = []
    if (ttfbChangePct < -10) parts.push(`TTFB ${ttfbChangePct}% vs previous ${range}`)
    if (cacheChangePp > 10) parts.push(`cache hit +${cacheChangePp}pp`)

    return {
      severity: 'good',
      headline: parts.join(' · '),
      body: `${host} improved this period. Avg TTFB ${avgTtfb}ms (was ${prevAvgTtfb}ms) · ${globalHitRate}% cache hit.`,
      actions: [],
    }
  }

  return null
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}
