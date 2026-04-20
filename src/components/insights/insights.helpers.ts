import type { Monitor } from '@/types/monitor'

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const TTFB_CRITICAL  = 500  // ms  — origin likely overloaded
export const TTFB_HIGH      = 300  // ms  — elevated, action recommended
export const CACHE_WARN     = 70   // %   — below optimal CDN efficiency
export const CACHE_CRITICAL = 40   // %   — cache is essentially non-functional
export const DELTA_WARN     = 20   // %   — TTFB increase vs 24h avg

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'warning' | 'info' | 'success'

export type Insight = {
  id:          string
  severity:    Severity
  title:       string
  description: string
  metric?:     string
  actionLabel: string
  actionHref?: string
}

// ─── safeHostname ─────────────────────────────────────────────────────────────

/** Extracts the hostname from a URL. Returns the original string on parse failure. */
export function safeHostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

// ─── aggregateTtfbTrend ───────────────────────────────────────────────────────

/** One sample per clock hour over the 24h window: index 0 = 24h ago, 24 = now. */
export const TTFB_TREND_HOURLY_POINTS = 25

/**
 * Leading zeros in sparklines are treated as missing; we back-fill from the first
 * positive sample so hourly resampling stays stable.
 */
function backfillThenForwardTtfb(raw: number[]): number[] {
  if (!raw.length) return []
  const firstPos = raw.findIndex(v => v > 0)
  if (firstPos === -1) return raw.map(() => 0)
  const seed = raw[firstPos]
  const out = raw.map((v, i) => (i < firstPos ? seed : v))
  let last = seed
  for (let i = 0; i < out.length; i++) {
    if (out[i] > 0) last = out[i]
    else out[i] = last
  }
  return out
}

function resampleToHourly(series: number[]): number[] {
  const n = series.length
  if (n === 0) return []
  if (n === 1) return Array.from({ length: TTFB_TREND_HOURLY_POINTS }, () => Math.round(series[0]))

  return Array.from({ length: TTFB_TREND_HOURLY_POINTS }, (_, h) => {
    const t = (h / 24) * (n - 1)
    const i0 = Math.floor(t)
    const i1 = Math.min(i0 + 1, n - 1)
    const frac = t - i0
    return Math.round(series[i0] * (1 - frac) + series[i1] * frac)
  })
}

/**
 * Aggregates per-monitor TTFB sparklines into a single global trend, then
 * resamples to **hourly** resolution ({@link TTFB_TREND_HOURLY_POINTS} samples:
 * 24h ago through now). Shorter sparklines use each monitor's last known value
 * at missing indices before averaging.
 */
export function aggregateTtfbTrend(monitors: Monitor[]): number[] {
  if (!monitors.length) return []

  const maxLen = Math.max(...monitors.map(m => m.ttfbSparkline.length))
  if (maxLen === 0) return []

  const raw = Array.from({ length: maxLen }, (_, i) => {
    const vals = monitors
      .map(m => m.ttfbSparkline[i] ?? m.ttfbSparkline.at(-1) ?? 0)
      .filter(v => v > 0)
    return vals.length
      ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
      : 0
  })

  const filled = backfillThenForwardTtfb(raw)
  if (filled.every(v => v <= 0)) return []

  return resampleToHourly(filled)
}

// ─── deriveInsights ───────────────────────────────────────────────────────────

/**
 * Derives up to 5 actionable insights from the current monitor snapshot.
 * Priority order:
 *   1. Critical / high TTFB (worst offender)
 *   2. Low cache hit rate
 *   3. Regional latency (only if < 4 insights already found)
 *   4. TTFB degradation trend (only if < 4 insights already found)
 *   5. All-healthy fallback when no issues are detected
 */
export function deriveInsights(monitors: Monitor[]): Insight[] {
  if (!monitors.length) return []
  const out: Insight[] = []

  // 1. TTFB — worst monitor
  const byTtfb   = [...monitors].sort((a, b) => b.ttfbCurrent - a.ttfbCurrent)
  const worstTtfb = byTtfb[0]

  if (worstTtfb.ttfbCurrent > TTFB_CRITICAL) {
    out.push({
      id:          'critical-ttfb',
      severity:    'critical',
      title:       'Critical response time',
      description: `${safeHostname(worstTtfb.url)} is at ${worstTtfb.ttfbCurrent}ms TTFB — well above acceptable thresholds. Origin may be overloaded or misconfigured.`,
      metric:      `${worstTtfb.ttfbCurrent}ms`,
      actionLabel: 'Inspect',
      actionHref:  `/dashboard/monitors/${worstTtfb.id}`,
    })
  } else if (worstTtfb.ttfbCurrent > TTFB_HIGH) {
    out.push({
      id:          'high-ttfb',
      severity:    'warning',
      title:       'Elevated TTFB detected',
      description: `${safeHostname(worstTtfb.url)} is at ${worstTtfb.ttfbCurrent}ms. Enable edge caching or review origin capacity to bring this below 200ms.`,
      metric:      `${worstTtfb.ttfbCurrent}ms`,
      actionLabel: 'Inspect',
      actionHref:  `/dashboard/monitors/${worstTtfb.id}`,
    })
  }

  // 2. Cache hit — worst monitor
  const withCache  = monitors.filter(m => m.cacheHitCurrent !== null)
  if (withCache.length > 0) {
    const worstCache = [...withCache].sort(
      (a, b) => (a.cacheHitCurrent ?? 100) - (b.cacheHitCurrent ?? 100),
    )[0]
    const hit = worstCache.cacheHitCurrent!

    if (hit < CACHE_WARN) {
      out.push({
        id:          'low-cache',
        severity:    hit < CACHE_CRITICAL ? 'critical' : 'warning',
        title:       'High cache miss rate',
        description: `${safeHostname(worstCache.url)} has only ${hit}% cache hits. Add Cache-Control: public, s-maxage=300 to origin responses to improve CDN efficiency.`,
        metric:      `${hit}% hit`,
        actionLabel: 'Review headers',
        actionHref:  `/dashboard/monitors/${worstCache.id}`,
      })
    }
  }

  // 3. Slow regions (gated: only add if room before the cap)
  const slowRegions = monitors.filter(m => m.slowRegionCount > 0)
  if (slowRegions.length > 0 && out.length < 4) {
    const worst = [...slowRegions].sort((a, b) => b.slowRegionCount - a.slowRegionCount)[0]
    const slowLabels = worst.regions
      .filter(r => r.isSlow)
      .map(r => r.label)
      .slice(0, 2)
      .join(', ')
    const extra = worst.slowRegionCount > 2 ? ` and ${worst.slowRegionCount - 2} more` : ''

    out.push({
      id:          'slow-regions',
      severity:    'warning',
      title:       'Regional latency detected',
      description: `${slowLabels}${extra} reporting high latency for ${safeHostname(worst.url)}. Your origin may be geographically distant from affected users.`,
      metric:      `${worst.slowRegionCount} region${worst.slowRegionCount > 1 ? 's' : ''}`,
      actionLabel: 'View regions',
      actionHref:  `/dashboard/monitors/${worst.id}`,
    })
  }

  // 4. TTFB degradation (gated: only add if room before the cap)
  const degrading = monitors.filter(m => m.ttfbCurrentDelta > DELTA_WARN)
  if (degrading.length > 0 && out.length < 4) {
    const worst = [...degrading].sort((a, b) => b.ttfbCurrentDelta - a.ttfbCurrentDelta)[0]
    out.push({
      id:          'ttfb-degradation',
      severity:    'warning',
      title:       'Performance trending worse',
      description: `${safeHostname(worst.url)} TTFB increased +${worst.ttfbCurrentDelta.toFixed(1)}% vs the 24h average. A recent deploy or config change may have caused a regression.`,
      metric:      `+${worst.ttfbCurrentDelta.toFixed(1)}%`,
      actionLabel: 'Investigate',
      actionHref:  `/dashboard/monitors/${worst.id}`,
    })
  }

  // 5. All-healthy fallback
  if (out.length === 0) {
    const avgTtfb = Math.round(
      monitors.reduce((s, m) => s + m.ttfbCurrent, 0) / monitors.length,
    )
    const cm       = monitors.filter(m => m.cacheHitCurrent !== null)
    const avgCache = cm.length
      ? Math.round(cm.reduce((s, m) => s + m.cacheHitCurrent!, 0) / cm.length)
      : null

    out.push({
      id:          'all-healthy',
      severity:    'success',
      title:       'All systems performing optimally',
      description: `No issues detected across ${monitors.length} monitor${monitors.length > 1 ? 's' : ''}. Global avg TTFB is ${avgTtfb}ms${avgCache !== null ? ` with ${avgCache}% cache efficiency` : ''}. Your edge infrastructure is in great shape.`,
      metric:      `${avgTtfb}ms`,
      actionLabel: 'View Monitors',
      actionHref:  '/monitors',
    })
  }

  return out.slice(0, 5)
}
