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
  causes?: string[]
  contextTooltip?: string
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
      recommendation: down.length > 0
        ? "Check origin server connectivity and firewall rules for unreachable hosts."
        : "Investigate origin server capacity and 5xx error logs.",
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
      recommendation: noHeader.length > 0
        ? "Enable 'Cache-Control' headers on all sites to activate edge acceleration."
        : "Monitor degraded sites for further latency regressions.",
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
  slowRegionLabels?: string[]
  slowestVsGlobalRegion?: { label: string; deltaPct: number } | null
  fastestVsGlobalRegion?: { label: string; deltaPct: number } | null
  totalRegionCount: number
  /** (liveAvgTtfb − periodAvgTtfb) / periodAvgTtfb × 100. Positive = worse. 0 when no baseline. */
  ttfbVsPeriodPct: number
  isDown?: boolean
  isDegraded?: boolean
  isOffline?: boolean
  lastErrorMessage?: string | null
}

/**
 * Derives a compact advisory banner for the Live (real-time) view inside a monitor detail page.
 * Callers must suppress this when the existing isDown / isDegraded banners are already visible.
 * Returns a healthy summary when no issues are detected.
 */
export function deriveMonitorDetailLiveAdvisor(input: MonitorDetailLiveInput): AdvisorState | null {
  const { monitorId, url, liveAvgTtfb, periodAvgTtfb, liveGlobalHitRate, hasLiveCacheData, liveDominantStatus,
    errorRegionCount, slowRegionCount, slowRegionLabels, slowestVsGlobalRegion, fastestVsGlobalRegion, totalRegionCount,
    ttfbVsPeriodPct, isDown, isDegraded, isOffline, lastErrorMessage } = input

  const host = hostname(url)

  // ── Critical: Monitor Offline (No probes) ──────────────────────────────
  if (isOffline) {
    return {
      severity: 'warning',
      headline: 'Monitor Offline',
      body: `No probes received in the current period. ${host} may be paused or the backend is unreachable from our fleet.`,
      actions: [],
    }
  }

  // ── Critical: Site Down ────────────────────────────────────────────────
  if (isDown) {
    return {
      severity: 'critical',
      headline: 'Site Down — Unreachable',
      body: `All ${totalRegionCount} probed regions are reporting connection failures. ${host} is not responding.`,
      recommendation: translateErrorMessage(lastErrorMessage) || "Check your origin firewall and SSL certificate validity.",
      actions: [
        { label: 'Troubleshoot Outage', href: buildViewHref('performance', '24h', monitorId) }
      ],
    }
  }

  // ── Critical: Degraded / Partial Outage ────────────────────────────────
  if (isDegraded) {
    return {
      severity: 'critical',
      headline: 'Partial Outage detected',
      body: `${errorRegionCount} of ${totalRegionCount} regions are failing to reach ${host}.`,
      recommendation: "Investigate regional networking issues or origin rate-limiting.",
      actions: [
        { label: 'Troubleshoot Regions', href: buildViewHref('performance', '24h', monitorId) }
      ],
    }
  }

  // Full outage — caller should already show the isDown banner; skip here.
  if (totalRegionCount > 0 && errorRegionCount >= totalRegionCount) return null

  // Partial outage — caller should already show the isDegraded banner; skip here.
  if (errorRegionCount > 0) return null

  // Critical TTFB
  if (liveAvgTtfb > MONITOR_TTFB.SLOW) {
    const trendNote = ttfbVsPeriodPct > 0 && periodAvgTtfb > 0
      ? ` Up from ~${periodAvgTtfb}ms period avg (+${ttfbVsPeriodPct}%).`
      : ''
    
    let body = `Currently at ${liveAvgTtfb}ms.${trendNote}`
    let recommendation = ""

    if (!hasLiveCacheData) {
      body = "No cache headers detected. Serving all requests from origin causes high latency."
      recommendation = "Enable 'Cache-Control' to activate edge acceleration and reduce origin load."
    } else if (input.liveAvgOriginMs > input.liveAvgEdgeMs * 1.5) {
      body = `Origin latency is dominant (${input.liveAvgOriginMs}ms). Optimize backend processing or database queries.`
    } else if (input.liveAvgEdgeMs > 200) {
      body = `Edge latency is elevated (${input.liveAvgEdgeMs}ms). Check for large response sizes or TLS overhead.`
    }

    const actions: AdvisorAction[] = []
    if (hasLiveCacheData) {
      actions.push({ label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', '24h', monitorId) })
    }

    return {
      severity: 'critical',
      headline: `High latency: ${liveAvgTtfb}ms`,
      body,
      recommendation: recommendation || undefined,
      actions,
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

  // Low cache hit
  if (hasLiveCacheData && liveGlobalHitRate < MONITOR_CACHE.LOW) {
    const originPct = 100 - liveGlobalHitRate
    let recommendation = "Review your Cache-Control headers to improve performance."
    
    const status = liveDominantStatus?.toUpperCase()
    if (status === 'DYNAMIC') {
      recommendation = "Responses are marked as DYNAMIC. Ensure your backend isn't sending 'no-cache' for static assets."
    } else if (status === 'BYPASS') {
      recommendation = "Cache is being bypassed. Check for 'Authorization' headers or specific cookies forcing origin fetch."
    } else if (status === 'NO HEADER' || status === 'HIDDEN') {
      recommendation = "No cache status reported. Add 'Cache-Control' or 'CDN-Cache-Control' to enable edge caching."
    }

    const actions: AdvisorAction[] = []
    if (hasLiveCacheData) {
      actions.push({ label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', '24h', monitorId) })
    }
    actions.push({ label: `Analyze ${host} Performance`, href: buildViewHref('performance', '24h', monitorId) })

    let severity: AdvisorState['severity'] = liveGlobalHitRate < 30 ? 'critical' : 'warning'
    if (status === 'BYPASS' || status === 'DYNAMIC') {
      severity = 'warning'
    }

    return {
      severity,
      headline: `Low cache hit: ${liveGlobalHitRate}%`,
      body: `Origin load is high: ${originPct}% of requests are bypassing edge cache.`,
      recommendation,
      actions,
    }
  }

  const hasExtremeRegionalSpread = !!(
    slowestVsGlobalRegion &&
    fastestVsGlobalRegion &&
    slowestVsGlobalRegion.deltaPct >= 70 &&
    Math.abs(fastestVsGlobalRegion.deltaPct) >= 70
  )

  if (hasExtremeRegionalSpread) {
    return {
      severity: 'warning',
      headline: `High regional variance: +${slowestVsGlobalRegion!.deltaPct}% / ${fastestVsGlobalRegion!.deltaPct}%`,
      body: `${slowestVsGlobalRegion!.label} is much slower while ${fastestVsGlobalRegion!.label} is much faster than global average. This often indicates uneven regional routing or edge coverage.`,
      contextTooltip: `Affected regions: ${slowestVsGlobalRegion!.label} (+${slowestVsGlobalRegion!.deltaPct}%) and ${fastestVsGlobalRegion!.label} (${fastestVsGlobalRegion!.deltaPct}%).`,
      recommendation: "Review regional routing, edge PoP coverage, and origin proximity for impacted geographies.",
      actions: [{ label: `Analyze ${host} Performance`, href: buildViewHref('performance', '24h', monitorId) }],
    }
  }

  if (slowRegionCount > 0) {
    const actions: AdvisorAction[] = []
    if (hasLiveCacheData) {
      actions.push({ label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', '24h', monitorId) })
    }

    return {
      severity: 'warning',
      headline: `${slowRegionCount} slow region${slowRegionCount > 1 ? 's' : ''}`,
      body: `${slowRegionCount} region${slowRegionCount > 1 ? 's are' : ' is'} experiencing high latency. Origin may be geographically distant from these regions.`,
      contextTooltip: buildAffectedRegionsTooltip(input.slowRegionLabels),
      recommendation: "Consider using a CDN with better regional coverage or a global edge network.",
      actions,
    }
  }

  return {
    severity: 'good',
    headline: 'Live performance stable',
    body: `${host} is within healthy live thresholds right now (${liveAvgTtfb}ms TTFB).`,
    actions: [],
  }
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
  slowRegionCount: number
  isDown?: boolean
  isDegraded?: boolean
  isOffline?: boolean
  errorCount?: number
  totalRegionCount?: number
  lastErrorMessage?: string | null
  slowRegionLabels?: string[]
}

export function deriveMonitorPerformancePeriodAdvisor(input: MonitorPerformancePeriodInput): AdvisorState | null {
  const { monitorId, url, range, avgTtfb, prevAvgTtfb, globalHitRate, prevGlobalHitRate,
    hasHistory, isDown, isDegraded, isOffline, errorCount, totalRegionCount, lastErrorMessage, slowRegionLabels } = input

  const host = hostname(url)

  // ── Critical: Monitor Offline (No probes) ──────────────────────────────
  if (isOffline) {
    return {
      severity: 'warning',
      headline: 'No data for this period',
      body: `${host} has no recorded activity in the last ${range}. The monitor may have been paused.`,
      actions: [],
    }
  }

  // ── Critical: Site Down ────────────────────────────────────────────────
  if (isDown) {
    return {
      severity: 'critical',
      headline: 'Site Down — Unreachable',
      body: `During this ${range} window, all regions reported connection failures.`,
      recommendation: translateErrorMessage(lastErrorMessage) || "Verify origin availability and check for long-term DNS or SSL issues.",
      actions: [
        { label: 'Troubleshoot Outage', href: buildViewHref('performance', range, monitorId) }
      ],
    }
  }

  // ── Critical: Partial Outage ───────────────────────────────────────────
  if (isDegraded) {
    return {
      severity: 'critical',
      headline: 'Significant downtime detected',
      body: `Partial outages were detected across ${errorCount} regions during this ${range} window.`,
      recommendation: "Review the 'Uptime' column in the regional table below to identify affected periods.",
      actions: [
        { label: 'Troubleshoot Regions', href: buildViewHref('performance', range, monitorId) }
      ],
    }
  }
  const ttfbChangePct = (hasHistory && prevAvgTtfb > 0) ? Math.round(((avgTtfb - prevAvgTtfb) / prevAvgTtfb) * 100) : 0
  const cacheChangePp  = hasHistory ? globalHitRate - prevGlobalHitRate : 0

  // ── Critical: Absolute high latency (Instant feedback) ──────────────────
  if (avgTtfb > MONITOR_TTFB.SLOW) {
    const trendNote = (hasHistory && ttfbChangePct > 0)
      ? ` Up ${ttfbChangePct}% vs previous ${range}.`
      : ''

    return {
      severity: 'critical',
      headline: `High latency: ${avgTtfb}ms`,
      body: `Global latency is currently elevated.${trendNote} Check origin performance and edge distribution.`,
      recommendation: "Investigate origin server response times or geographic distribution issues.",
      actions: [
        { label: `Analyze ${host} Trends`, href: buildViewHref('trends', range, monitorId) },
        { label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', range, monitorId) },
      ],
    }
  }

  // ── Critical: significant TTFB regression (Requires History) ──────────────
  if (hasHistory && ttfbChangePct > 40) {
    return {
      severity: 'critical',
      headline: `Latency up ${ttfbChangePct}% vs previous ${range}`,
      body: `Global latency increased to ${avgTtfb}ms (from ${prevAvgTtfb}ms).`,
      recommendation: "Investigate recent origin infrastructure changes or network route changes.",
      actions: [
        { label: `Analyze ${host} Trends`, href: buildViewHref('trends', range, monitorId) },
        { label: `Audit ${host} Edge`, href: buildViewHref('infrastructure', range, monitorId) },
      ],
    }
  }

  // ── Warning: moderate regression or cache drop ────────────────────────────
  if (ttfbChangePct > 10 || cacheChangePp < -10 || input.slowRegionCount > 0) {
    const parts: string[] = []
    const bodyParts: string[] = []
    if (ttfbChangePct > 10) parts.push(`TTFB +${ttfbChangePct}% vs previous ${range}`)
    if (cacheChangePp < -10) parts.push(`cache hit ${cacheChangePp}pp`)
    if (input.slowRegionCount > 0) {
      parts.push(`${input.slowRegionCount} slow region${input.slowRegionCount > 1 ? 's' : ''}`)
      if (slowRegionLabels && slowRegionLabels.length > 0) {
        bodyParts.push(`Slow regions detected: ${slowRegionLabels.join(', ')}.`)
      } else {
        bodyParts.push(`${input.slowRegionCount} region${input.slowRegionCount > 1 ? 's are' : ' is'} slower than the FAST threshold.`)
      }
    }

    if (ttfbChangePct > 10) {
      bodyParts.push(`Global latency increased to ${avgTtfb}ms (from ${prevAvgTtfb}ms).`)
    }

    if (cacheChangePp < -10) {
      bodyParts.push(`Cache hit rate dropped by ${Math.abs(cacheChangePp)}%.`)
    }

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body: bodyParts.join(' '),
      contextTooltip: input.slowRegionCount > 0 ? buildAffectedRegionsTooltip(input.slowRegionLabels) : undefined,
      recommendation: input.slowRegionCount > 0 
        ? "Optimize regional edge delivery or investigate origin latency for affected areas."
        : "Monitor for continued degradation. Check recent config changes.",
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
      body: `Performance improved this period. Global latency is down to ${avgTtfb}ms (from ${prevAvgTtfb}ms).`,
      actions: [],
    }
  }

  // ── Stable ───────────────────────────────────────────────────────────────
  return {
    severity: 'good',
    headline: 'Performance stable',
    body: `${host} is performing within expected parameters for the last ${range}.`,
    actions: [],
  }
}

// ─── Monitor detail — trends view ───────────────────────────────────────────

export type MonitorTrendsAdvisorInput = {
  url: string
  range: string
  spikeCount: number
  hasHistory: boolean
  worstRegion: { label: string; changePct: number } | null
}

/**
 * Derives a summary advisory specifically for the Trends view,
 * focusing on latency spikes.
 */
export function deriveMonitorTrendsAdvisor(input: MonitorTrendsAdvisorInput): AdvisorState | null {
  const host = hostname(input.url)
  const hasSpikes = input.spikeCount > 0
  const significantRegression = input.worstRegion && input.worstRegion.changePct > 20

  if (!input.hasHistory && !hasSpikes) {
    return {
      severity: 'good',
      headline: 'Performance patterns stable',
      body: `Latency patterns for ${host} are being established. No significant spikes or anomalies detected in the current collection period.`,
      actions: [],
    }
  }
  if (hasSpikes || significantRegression) {
    const parts: string[] = []
    if (hasSpikes) parts.push(`${input.spikeCount} latency spike${input.spikeCount > 1 ? 's' : ''}`)
    if (significantRegression) parts.push(`Regional regression`)

    const bodyParts: string[] = []
    if (hasSpikes) bodyParts.push(`${input.spikeCount} significant latency spike${input.spikeCount > 1 ? 's were' : ' was'} detected for ${host} in the last ${input.range}.`)
    if (significantRegression) bodyParts.push(`${input.worstRegion!.label} performance degraded by ${input.worstRegion!.changePct}% week-over-week.`)

    const causes: string[] = []
    if (hasSpikes) {
      causes.push("Intermittent backend processing delays or database locks.")
    }
    if (significantRegression) {
      causes.push(`Recent configuration changes or deployments affecting ${input.worstRegion!.label}.`)
      causes.push("Increased regional traffic or edge routing degradation.")
    }

    return {
      severity: (input.spikeCount > 5 || (input.worstRegion && input.worstRegion.changePct > 50)) ? 'critical' : 'warning',
      headline: parts.join(' · '),
      body: bodyParts.join(' '),
      causes,
      recommendation: significantRegression
        ? `Investigate edge cache hits and routing in ${input.worstRegion!.label}. Verify recent deployments.`
        : "Investigate backend logs or external dependencies during spike periods.",
      actions: [],
    }
  }

  return {
    severity: 'good',
    headline: 'Stable trends',
    body: `${host} maintained stable response times without significant spikes or regional regressions in the last ${input.range}.`,
    actions: [],
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function buildAffectedRegionsTooltip(regionLabels?: string[]): string | undefined {
  if (!regionLabels || regionLabels.length === 0) return undefined
  if (regionLabels.length <= 4) return `Affected regions: ${regionLabels.join(', ')}.`
  const visible = regionLabels.slice(0, 4).join(', ')
  return `Affected regions: ${visible}, and ${regionLabels.length - 4} more.`
}

function translateErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null

  const e = error.toLowerCase()
  
  if (e.includes('ssl routines') || e.includes('eproto') || e.includes('certificate')) {
    return "SSL/TLS Protocol Error. The server returned an invalid handshake. Verify if the site is properly configured for HTTPS on this port and has a valid certificate."
  }
  if (e.includes('econnrefused')) {
    return "Connection Refused. The server is active but rejected the request. Ensure your web server (Nginx/Apache/IIS) is running and listening on the correct port."
  }
  if (e.includes('etimedout') || e.includes('timeout')) {
    return "Connection Timeout. The server took too long to respond. This usually indicates a firewall block (security group) or extreme resource exhaustion."
  }
  if (e.includes('enotfound') || e.includes('dns')) {
    return "DNS Resolution Error. The domain name could not be mapped to an IP address. Check your nameserver records."
  }
  
  return `Connection failure: ${error}`
}
