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

  // 1. Identify issues by severity
  const down = active.filter(m => m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount)
  const failingOrigin = active.filter(m => !down.includes(m) && m.error5xxCount > 0)
  
  const criticallyInefficient = active.filter(m => 
    !down.includes(m) && !failingOrigin.includes(m) &&
    monitorCacheHitIsComparable(m) && m.cacheHitAvg1h !== null && m.cacheHitAvg1h < MONITOR_CACHE.LOW
  )
  
  const criticallySlow = active.filter(m => 
    !down.includes(m) && !failingOrigin.includes(m) && !criticallyInefficient.includes(m) &&
    m.ttfbAvg1h >= MONITOR_TTFB.SLOW
  )

  const criticalIssues = [...down, ...failingOrigin, ...criticallyInefficient, ...criticallySlow]

  const originWarning = active.filter(m => !criticalIssues.includes(m) && m.error4xxCount > 0)
  const noHeader = active.filter(m => !criticalIssues.includes(m) && getCacheDisplayLabel(m.cacheStatusCurrent) === 'NO HEADER')
  const degraded = active.filter(m => !criticalIssues.includes(m) && !noHeader.includes(m) && !originWarning.includes(m) && (
    m.errorRegionCount > 0 ||
    m.ttfbAvg1h >= MONITOR_TTFB.FAST ||
    (monitorCacheHitIsComparable(m) && m.cacheHitAvg1h !== null && m.cacheHitAvg1h < MONITOR_CACHE.GOOD)
  ))

  // ── Critical: Outages, Errors or Extreme Performance Degradation ──────────
  if (criticalIssues.length > 0) {
    // Determine the "worst" one for the body text
    const worst = down.length > 0 ? down[0] 
                : failingOrigin.length > 0 ? failingOrigin[0]
                : criticallyInefficient.length > 0 ? criticallyInefficient[0]
                : criticallySlow[0]

    const actions: AdvisorAction[] = []
    if (down.length > 0) actions.push({ label: `Down (${down.length})`, href: '/monitors?filter=down' })
    if (failingOrigin.length > 0) actions.push({ label: `Origin Failures (${failingOrigin.length})`, href: '/monitors?filter=degraded' })
    if (criticallyInefficient.length > 0 || criticallySlow.length > 0) {
      actions.push({ label: `Critical Performance (${criticallyInefficient.length + criticallySlow.length})`, href: '/monitors?filter=degraded' })
    }

    let headline = ''
    if (down.length > 0) headline = `${down.length} monitor${down.length > 1 ? 's' : ''} DOWN`
    else if (failingOrigin.length > 0) headline = `Origin Health: ${failingOrigin.length} failing`
    else if (criticallyInefficient.length > 0) headline = `Critical Cache Efficiency issue`
    else headline = `Critical Latency detected`

    const secondaryCount = active.length - monitors.filter(m => monitorHealthScore(m) >= 90).length
    const secondarySuffix = secondaryCount > criticalIssues.length ? ` • ${secondaryCount} issues total` : ''

    const host = hostname(worst.url)
    const bodyParts: string[] = []
    if (down.includes(worst)) bodyParts.push(`${host} is unreachable from all regions.`)
    else if (failingOrigin.includes(worst)) bodyParts.push(`${host} is returning 5xx origin errors.`)
    else if (criticallyInefficient.includes(worst)) bodyParts.push(`${host} has critical cache inefficiency (${worst.cacheHitAvg1h}% hit rate).`)
    else bodyParts.push(`${host} is experiencing extreme latency (${worst.ttfbAvg1h}ms).`)

    return {
      severity: 'critical',
      headline: headline + secondarySuffix,
      body: bodyParts.join(' '),
      recommendation: down.length > 0 ? "Check server connectivity and firewall rules." 
                    : failingOrigin.length > 0 ? "Investigate origin server logs for 5xx errors."
                    : "Optimize edge cache rules and origin response times.",
      actions: actions.slice(0, 3),
    }
  }

  // ── Warning: Degraded, moderate errors, or missing headers ───────────────
  if (degraded.length > 0 || originWarning.length > 0 || noHeader.length > 0) {
    const worstWarning = [...degraded, ...originWarning].sort((a, b) => b.ttfbAvg1h - a.ttfbAvg1h)[0] || noHeader[0]
    
    const parts: string[] = []
    if (originWarning.length > 0) parts.push(`${originWarning.length} with 4xx errors`)
    if (degraded.length > 0) parts.push(`${degraded.length} degraded`)
    if (noHeader.length > 0) parts.push(`${noHeader.length} no cache headers`)

    const actions: AdvisorAction[] = []
    if (degraded.length > 0) actions.push({ label: 'Degraded', href: '/monitors?filter=degraded' })
    if (noHeader.length > 0) actions.push({ label: 'Headers', href: '/monitors?filter=missing-cache-headers' })
    if (worstWarning && actions.length < 3) actions.push({ label: `Inspect ${hostname(worstWarning.url)}`, href: buildViewHref('performance', '24h', worstWarning.id) })

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body: worstWarning ? `${hostname(worstWarning.url)} and others are showing performance warnings.` : 'Multiple sites are missing Cache-Control headers.',
      recommendation: "Review regional performance and ensure Cache-Control is active on all assets.",
      actions: actions.slice(0, 3),
    }
  }

  // ── Good: everything healthy ──────────────────────────────────────────────
  const avgTtfb = Math.round(active.reduce((s, m) => s + m.ttfbAvg1h, 0) / active.length)
  const withCache = active.filter(m => monitorCacheHitIsComparable(m) && m.cacheHitAvg1h !== null)
  const avgCache = withCache.length > 0
    ? Math.round(withCache.reduce((s, m) => s + m.cacheHitAvg1h!, 0) / withCache.length)
    : null

  return {
    severity: 'good',
    headline: `${active.length} monitors healthy`,
    body: `Global 1h avg: ${avgTtfb}ms${avgCache !== null ? ` · ${avgCache}% cache hit` : ''}. No issues detected.`,
    actions: [],
  }
}

function buildDegradedBody(m: Monitor): string {
  const host = hostname(m.url)
  if (m.error5xxCount > 0) return `${host} is reporting 5xx errors from the origin server.`
  if (m.error4xxCount > 0) return `${host} is reporting unusual 4xx status codes from origin.`

  const cacheNote = monitorCacheHitIsComparable(m) && m.cacheHitAvg1h !== null && m.cacheHitAvg1h < MONITOR_CACHE.GOOD
    ? ` · ${m.cacheHitAvg1h}% cache hit`
    : ''
  const regionNote = m.errorRegionCount > 0
    ? ` ${m.errorRegionCount} of ${m.totalRegionCount} regions failing.`
    : ''
  return `${host}: ${m.ttfbAvg1h}ms TTFB${cacheNote}.${regionNote}`
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
  thresholdMs?: number
  thresholdHitMs?: number
  cacheWarnPct?: number
  cacheCriticalPct?: number
}

/**
 * Derives a compact advisory banner for the Live (real-time) view inside a monitor detail page.
 * Callers must suppress this when the existing isDown / isDegraded banners are already visible.
 * Returns a healthy summary when no issues are detected.
 */
export function deriveMonitorDetailLiveAdvisor(input: MonitorDetailLiveInput): AdvisorState | null {
  const { monitorId, url, liveAvgTtfb, periodAvgTtfb, liveGlobalHitRate, hasLiveCacheData, liveDominantStatus,
    errorRegionCount, slowRegionCount, slowRegionLabels, slowestVsGlobalRegion, fastestVsGlobalRegion, totalRegionCount,
    ttfbVsPeriodPct, isDown, isDegraded, isOffline, lastErrorMessage,
    thresholdMs = MONITOR_TTFB.SLOW, thresholdHitMs = MONITOR_TTFB.FAST,
    cacheWarnPct = MONITOR_CACHE.GOOD, cacheCriticalPct = MONITOR_CACHE.LOW } = input

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

  // ── Critical: Absolute Low Cache Hit Rate ───────────────────────────────
  if (hasLiveCacheData && liveGlobalHitRate < cacheCriticalPct) {
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
    actions.push({ label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', '24h', monitorId) })
    actions.push({ label: `Analyze ${host} Performance`, href: buildViewHref('performance', '24h', monitorId) })

    // If cache hit is critically low (<50%), it's a critical issue unless explicitly bypassed/dynamic (which might be intended)
    const severity: AdvisorState['severity'] = (status === 'BYPASS' || status === 'DYNAMIC') ? 'warning' : 'critical'

    return {
      severity,
      headline: `Critical cache efficiency: ${liveGlobalHitRate}%`,
      body: `Origin load is high: ${originPct}% of requests are bypassing edge cache.`,
      recommendation,
      actions,
    }
  }

  // ── Critical: Absolute high latency (Instant feedback) ──────────────────
  if (liveAvgTtfb > thresholdMs) {
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
      actions.push({ label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', '24h', monitorId) })
    }

    return {
      severity: 'critical',
      headline: `High latency: ${liveAvgTtfb}ms`,
      body,
      recommendation: recommendation || undefined,
      actions,
    }
  }

  // ── Warning: Moderate Issues (TTFB or Cache) ────────────────────────────
  const isHighTtfbWarning = liveAvgTtfb > thresholdHitMs
  const isLowCacheWarning = hasLiveCacheData && liveGlobalHitRate < cacheWarnPct
  const isSignificantTrend = ttfbVsPeriodPct > 20

  if (isHighTtfbWarning || isLowCacheWarning || isSignificantTrend || slowRegionCount > 0) {
    const parts: string[] = []
    const bodyParts: string[] = []

    if (isLowCacheWarning) parts.push(`Cache Hit Rate ${liveGlobalHitRate}%`)
    if (isHighTtfbWarning) parts.push(`TTFB ${liveAvgTtfb}ms`)
    if (slowRegionCount > 0) parts.push(`${slowRegionCount} slow region${slowRegionCount > 1 ? 's' : ''}`)

    if (isLowCacheWarning) {
      bodyParts.push(`Cache hit rate is below optimal levels (${liveGlobalHitRate}%).`)
    }
    if (isSignificantTrend) {
      bodyParts.push(`TTFB is up ${ttfbVsPeriodPct}% vs period avg.`)
    }
    if (slowRegionCount > 0) {
      bodyParts.push(`Slow regions detected: ${slowRegionLabels?.join(', ')}.`)
    }

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body: bodyParts.join(' '),
      contextTooltip: slowRegionCount > 0 ? buildAffectedRegionsTooltip(slowRegionLabels) : undefined,
      recommendation: isLowCacheWarning 
        ? "Optimize Cache-Control headers to increase edge efficiency."
        : "Check recent code deployments or origin server load spikes.",
      actions: [{ label: `Analyze ${host} Trends`, href: buildViewHref('trends', '24h', monitorId) }],
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
      actions.push({ label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', '24h', monitorId) })
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
  /** Probes in CDN HIT/MISS bucket — same idea as Timescale `cdn_count`. When 0, skip cache warnings. */
  periodCacheCdnSamples?: number
  prevPeriodCacheCdnSamples?: number
  hasHistory: boolean
  slowRegionCount: number
  isDown?: boolean
  isDegraded?: boolean
  isOffline?: boolean
  errorCount?: number
  totalRegionCount?: number
  lastErrorMessage?: string | null
  slowRegionLabels?: string[]
  thresholdMs?: number
  thresholdHitMs?: number
  cacheWarnPct?: number
  cacheCriticalPct?: number
}

export function deriveMonitorPerformancePeriodAdvisor(input: MonitorPerformancePeriodInput): AdvisorState | null {
  const { monitorId, url, range, avgTtfb, prevAvgTtfb, globalHitRate, prevGlobalHitRate,
    hasHistory, isDown, isDegraded, isOffline, errorCount, totalRegionCount, lastErrorMessage, slowRegionLabels,
    thresholdMs = MONITOR_TTFB.SLOW, thresholdHitMs = MONITOR_TTFB.FAST,
    cacheWarnPct = MONITOR_CACHE.GOOD, cacheCriticalPct = MONITOR_CACHE.LOW } = input

  const cacheMetricApplicable = (input.periodCacheCdnSamples ?? 0) > 0
  const prevCacheMetricApplicable = (input.prevPeriodCacheCdnSamples ?? 0) > 0

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
  const cacheChangePp =
    hasHistory && cacheMetricApplicable && prevCacheMetricApplicable
      ? globalHitRate - prevGlobalHitRate
      : 0

  // ── Critical: Absolute Low Cache Hit Rate ───────────────────────────────
  if (cacheMetricApplicable && globalHitRate < cacheCriticalPct) {
    return {
      severity: 'critical',
      headline: `Critical cache efficiency: ${globalHitRate}%`,
      body: `Most requests are hitting the origin server directly, causing significant load and latency issues.`,
      recommendation: "Review Cache-Control headers and edge rules to improve CDN hit rate.",
      actions: [
        { label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', range, monitorId) },
        { label: `Analyze ${host} Performance`, href: buildViewHref('performance', range, monitorId) },
      ],
    }
  }

  // ── Critical: Absolute high latency (Instant feedback) ──────────────────
  if (avgTtfb > thresholdMs) {
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
        { label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', range, monitorId) },
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
        { label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', range, monitorId) },
      ],
    }
  }

  // ── Warning: moderate issues ──────────────────────────────────────────────
  const isLowCacheWarning = cacheMetricApplicable && globalHitRate < cacheWarnPct
  const isHighTtfbWarning = avgTtfb > thresholdHitMs
  const isRegressionWarning = ttfbChangePct > 10 || (cacheMetricApplicable && prevCacheMetricApplicable && cacheChangePp < -10)

  if (isLowCacheWarning || isHighTtfbWarning || isRegressionWarning || input.slowRegionCount > 0) {
    const parts: string[] = []
    const bodyParts: string[] = []

    if (isLowCacheWarning) parts.push(`Cache Hit Rate ${globalHitRate}%`)
    if (isHighTtfbWarning) parts.push(`TTFB ${avgTtfb}ms`)
    if (input.slowRegionCount > 0) parts.push(`${input.slowRegionCount} slow region${input.slowRegionCount > 1 ? 's' : ''}`)
    if (ttfbChangePct > 10) parts.push(`TTFB +${ttfbChangePct}%`)

    if (isLowCacheWarning) {
      bodyParts.push(`Cache hit rate is below optimal levels (${globalHitRate}%).`)
    }
    if (input.slowRegionCount > 0) {
      if (slowRegionLabels && slowRegionLabels.length > 0) {
        bodyParts.push(`Slow regions: ${slowRegionLabels.join(', ')}.`)
      } else {
        bodyParts.push(`${input.slowRegionCount} region${input.slowRegionCount > 1 ? 's are' : ' is'} slower than FAST threshold.`)
      }
    }
    if (ttfbChangePct > 10) {
      bodyParts.push(`Latency increased vs previous period.`)
    }

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body: bodyParts.join(' '),
      contextTooltip: input.slowRegionCount > 0 ? buildAffectedRegionsTooltip(input.slowRegionLabels) : undefined,
      recommendation: isLowCacheWarning 
        ? "Optimize Cache-Control headers to increase edge efficiency."
        : "Inspect regional routing or origin processing times.",
      actions: [{ label: `Analyze ${host} Performance`, href: buildViewHref('performance', range, monitorId) }],
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
      headline: 'No spikes detected',
      body: `Latency data for ${host} is being established. No significant spikes or anomalies detected in the current collection period.`,
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

// ─── Monitor detail — patterns view ──────────────────────────────────────────

export type MonitorPatternsAdvisorInput = {
  url: string
  range: string
  monitorId: string
  hourlyPattern: Array<{
    hour_of_day: number
    ttfb_avg: number
    ttfb_p95: number | null
    cache_hit_pct: number | null
    sample_count: number
  }>
  thresholdMs?: number
  thresholdHitMs?: number
  cacheWarnPct?: number
}

export function deriveMonitorPatternsAdvisor(input: MonitorPatternsAdvisorInput): AdvisorState | null {
  const { url, range, monitorId, hourlyPattern,
    thresholdMs = MONITOR_TTFB.SLOW, thresholdHitMs = MONITOR_TTFB.FAST,
    cacheWarnPct = MONITOR_CACHE.GOOD } = input

  const host = hostname(url)

  if (hourlyPattern.length < 3) {
    return {
      severity: 'good',
      headline: 'Building hourly patterns',
      body: `Not enough data yet to detect recurring trends. Check back after a few more hours of probes.`,
      actions: [],
    }
  }

  const sorted = [...hourlyPattern].sort((a, b) => b.ttfb_avg - a.ttfb_avg)
  const worstHour = sorted[0]
  const bestHour = sorted[sorted.length - 1]
  const overallAvgTtfb = Math.round(hourlyPattern.reduce((s, h) => s + h.ttfb_avg, 0) / hourlyPattern.length)
  const spread = worstHour.ttfb_avg - bestHour.ttfb_avg

  const withCacheData = hourlyPattern.filter(h => h.cache_hit_pct !== null)
  const worstCacheHour = withCacheData.length > 0
    ? [...withCacheData].sort((a, b) => (a.cache_hit_pct ?? 100) - (b.cache_hit_pct ?? 100))[0]
    : null

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`

  // ── Critical: Peak hour at or above SLOW threshold ──────────────────────
  if (worstHour.ttfb_avg >= thresholdMs) {
    return {
      severity: 'critical',
      headline: `Peak hour latency: ${worstHour.ttfb_avg}ms at ${fmt(worstHour.hour_of_day)}`,
      body: `${host} shows critical latency during peak load hours. Overall avg: ${overallAvgTtfb}ms.`,
      recommendation: "Pre-warm the CDN cache before peak hours or scale origin capacity to handle demand.",
      actions: [
        { label: `Analyze ${host} Performance`, href: buildViewHref('performance', range, monitorId) },
        { label: `Edge vs Origin — ${host}`, href: buildViewHref('infrastructure', range, monitorId) },
      ],
    }
  }

  // ── Warning: Peak hour above FAST, low cache hit at some hour, or high spread
  const isPeakWarning = worstHour.ttfb_avg >= thresholdHitMs
  const isCacheDipWarning = worstCacheHour !== null && (worstCacheHour.cache_hit_pct ?? 100) < cacheWarnPct
  const isHighVariance = spread >= 300 && spread > overallAvgTtfb

  if (isPeakWarning || isCacheDipWarning || isHighVariance) {
    const parts: string[] = []
    const bodyParts: string[] = []

    if (isPeakWarning) {
      parts.push(`Peak ${worstHour.ttfb_avg}ms at ${fmt(worstHour.hour_of_day)}`)
      bodyParts.push(`Latency peaks at ${worstHour.ttfb_avg}ms (${fmt(worstHour.hour_of_day)}), lowest at ${bestHour.ttfb_avg}ms (${fmt(bestHour.hour_of_day)}).`)
    }
    if (isCacheDipWarning) {
      parts.push(`Cache dip: ${worstCacheHour.cache_hit_pct}% at ${fmt(worstCacheHour.hour_of_day)}`)
      if (!isPeakWarning) bodyParts.push(`Cache hit drops to ${worstCacheHour.cache_hit_pct}% at ${fmt(worstCacheHour.hour_of_day)}.`)
    }
    if (isHighVariance && !isPeakWarning) {
      parts.push(`${spread}ms spread`)
      bodyParts.push(`Wide latency variance: ${spread}ms spread between best and worst hours.`)
    }

    return {
      severity: 'warning',
      headline: parts.join(' · '),
      body: bodyParts.join(' '),
      recommendation: isCacheDipWarning
        ? "Check if peak-hour traffic triggers cache misses — review TTL settings and cache key rules."
        : "Consider pre-warming the cache or scaling origin capacity before peak load windows.",
      actions: [{ label: `Analyze ${host} Performance`, href: buildViewHref('performance', range, monitorId) }],
    }
  }

  // ── Good ────────────────────────────────────────────────────────────────
  const spreadNote = spread > 100
    ? ` Peak at ${fmt(worstHour.hour_of_day)} (${worstHour.ttfb_avg}ms), lowest at ${fmt(bestHour.hour_of_day)} (${bestHour.ttfb_avg}ms).`
    : ''
  return {
    severity: 'good',
    headline: 'Stable hourly patterns',
    body: `${host} shows consistent performance across all hours. Avg: ${overallAvgTtfb}ms.${spreadNote}`,
    actions: [],
  }
}

// ─── Monitor detail — security view ──────────────────────────────────────────

const SSL_CRITICAL_DAYS = 15
const SSL_WARNING_DAYS = 30
const SECURITY_SCORE_CRITICAL = 2
const SECURITY_SCORE_WARNING = 5

export type MonitorSecurityAdvisorInput = {
  url: string
  monitorId: string
  securityScore: number | null
  sslDaysRemaining: number | null
  sslProtocol: string | null
  hasDrift: boolean
  driftRegionCount: number
  hasHsts: boolean
}

export function deriveMonitorSecurityAdvisor(input: MonitorSecurityAdvisorInput): AdvisorState | null {
  const { url, securityScore, sslDaysRemaining, sslProtocol, hasDrift, driftRegionCount, hasHsts } = input
  if (securityScore === null) return null

  const host = hostname(url)

  // ── Critical: SSL expired ──────────────────────────────────────────────
  if (sslDaysRemaining !== null && sslDaysRemaining <= 0) {
    return {
      severity: 'critical',
      headline: 'SSL certificate expired',
      body: `${host} has an expired certificate. Browsers will reject the connection and show security warnings to all visitors.`,
      recommendation: "Renew the TLS certificate immediately via your CA or hosting provider.",
      actions: [],
    }
  }

  // ── Critical: SSL expiring very soon ──────────────────────────────────
  if (sslDaysRemaining !== null && sslDaysRemaining < SSL_CRITICAL_DAYS) {
    return {
      severity: 'critical',
      headline: `SSL expiring in ${sslDaysRemaining} day${sslDaysRemaining !== 1 ? 's' : ''}`,
      body: `${host} TLS certificate expires imminently. After expiry, browsers will block access for all users.`,
      recommendation: "Renew the certificate immediately. Check if auto-renewal is configured.",
      actions: [],
    }
  }

  // ── Critical: Very low security score ─────────────────────────────────
  if (securityScore <= SECURITY_SCORE_CRITICAL) {
    return {
      severity: 'critical',
      headline: `Security score: ${securityScore}/9 — critical`,
      body: `${host} is missing most security headers, leaving it exposed to XSS, clickjacking, and protocol downgrade attacks.`,
      recommendation: "Add HSTS, Content-Security-Policy, X-Frame-Options, and X-Content-Type-Options at minimum.",
      causes: [
        "Missing HSTS allows SSL-stripping attacks.",
        "Missing CSP enables malicious script injection.",
        "Missing X-Frame-Options exposes users to clickjacking.",
      ],
      actions: [],
    }
  }

  // ── Warning: SSL expiring soon ────────────────────────────────────────
  if (sslDaysRemaining !== null && sslDaysRemaining < SSL_WARNING_DAYS) {
    return {
      severity: 'warning',
      headline: `SSL renewing soon: ${sslDaysRemaining} days left`,
      body: `${host} certificate expires in ${sslDaysRemaining} days. Schedule renewal before it reaches the critical window.`,
      recommendation: "Enable auto-renewal with Let's Encrypt or your CA if not already configured.",
      actions: [],
    }
  }

  // ── Warning: Moderate security score ──────────────────────────────────
  if (securityScore <= SECURITY_SCORE_WARNING) {
    return {
      severity: 'warning',
      headline: `Security score: ${securityScore}/9`,
      body: `${host} is missing several security headers. Each gap is an exploitable attack surface.`,
      recommendation: "Prioritize adding HSTS and CSP. Review the checklist below.",
      causes: [
        "Missing HSTS allows HTTP downgrade and SSL-stripping attacks.",
        "Missing CSP enables cross-site scripting vulnerabilities.",
        "Missing X-Frame-Options exposes users to clickjacking.",
      ],
      actions: [],
    }
  }

  // ── Warning: Security drift across regions ────────────────────────────
  if (hasDrift) {
    return {
      severity: 'warning',
      headline: `Security drift: ${driftRegionCount} region${driftRegionCount !== 1 ? 's' : ''} differ`,
      body: `Inconsistent security headers detected across regions. Some edge nodes may be less protected than others.`,
      recommendation: "Ensure your CDN or origin propagates a uniform security header policy to all edge nodes.",
      actions: [],
    }
  }

  // ── Warning: Deprecated TLS protocol ──────────────────────────────────
  if (sslProtocol && (sslProtocol.includes('1.0') || sslProtocol.includes('1.1'))) {
    return {
      severity: 'warning',
      headline: `Deprecated TLS: ${sslProtocol}`,
      body: `${host} is serving over ${sslProtocol}, which is deprecated and vulnerable to known attacks (POODLE, BEAST).`,
      recommendation: "Disable TLS 1.0 and 1.1 in your CDN or server config. Enforce TLS 1.2+ minimum.",
      actions: [],
    }
  }

  // ── Warning: HSTS missing despite otherwise good score ────────────────
  if (!hasHsts) {
    return {
      severity: 'warning',
      headline: 'HSTS header missing',
      body: `${host} lacks Strict-Transport-Security. Browsers may connect via HTTP first, enabling protocol downgrade attacks.`,
      recommendation: "Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains' to all HTTPS responses.",
      actions: [],
    }
  }

  // ── Good ────────────────────────────────────────────────────────────────
  const sslNote = sslDaysRemaining !== null ? ` · SSL valid (${sslDaysRemaining}d)` : ''
  return {
    severity: 'good',
    headline: `Security posture good: ${securityScore}/9`,
    body: `${host} has all critical security headers active. No drift or certificate issues detected.${sslNote}`,
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
