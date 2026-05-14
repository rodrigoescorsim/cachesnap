import { describe, it, expect } from 'vitest'
import {
  alertTypeDisplay,
  alertTypeSeverity,
  comparatorDisplay,
  formatDuration,
  formatMetricDelta,
  formatMetricValue,
  formatTimestamp,
  incidentStatus,
  isCacheHitTrendDrop,
  isCacheMetric,
  metricUnit,
  severityContext,
  REGION_SUMMARY_PILL_LIMIT,
  normalizeLegacyTrendDiagnosisCopy,
} from './incident-display'

describe('normalizeLegacyTrendDiagnosisCopy (legacy DB diagnosis rows)', () => {
  it('rewrites global TTFB trend copy to match current API wording', () => {
    const legacy =
      'TTFB increased 31.6% vs previous hour · all regions · 359ms now vs 273ms reference'
    const out = normalizeLegacyTrendDiagnosisCopy(legacy)
    expect(out).toBe(
      'Global aggregate TTFB increased 31.6% vs previous hour — 359ms now vs 273ms reference',
    )
    expect(out).not.toContain('all regions')
  })

  it('rewrites global cache hit trend copy', () => {
    const legacy =
      'Cache hit fell 11.1 pp vs previous hour (14.2% relative) · all regions · 67.2% now vs 78.3% reference'
    expect(normalizeLegacyTrendDiagnosisCopy(legacy)).toBe(
      'Global cache hit rate fell 11.1 pp vs previous hour (14.2% relative) — 67.2% now vs 78.3% reference',
    )
  })

  it('handles All regions label after region id substitution', () => {
    const legacy =
      'TTFB increased 10.0% vs previous hour · All regions · 400ms now vs 360ms reference'
    expect(normalizeLegacyTrendDiagnosisCopy(legacy)).toContain('Global aggregate TTFB')
    expect(normalizeLegacyTrendDiagnosisCopy(legacy)).not.toContain('All regions')
  })

  it('rewrites legacy __global__ segment in the middle', () => {
    const legacy =
      'TTFB increased 2.0% vs previous hour · __global__ · 100ms now vs 98ms reference'
    const out = normalizeLegacyTrendDiagnosisCopy(legacy)
    expect(out).toContain('Global aggregate TTFB')
    expect(out).not.toContain('__global__')
  })

  it('is a no-op for regional trend copy', () => {
    const regional =
      'TTFB increased 5.0% vs previous hour · eu-west · 200ms now vs 190ms reference'
    expect(normalizeLegacyTrendDiagnosisCopy(regional)).toBe(regional)
  })

  it('is a no-op for unrelated diagnosis text', () => {
    const other = 'TTFB significantly above each region baseline.'
    expect(normalizeLegacyTrendDiagnosisCopy(other)).toBe(other)
  })
})

describe('REGION_SUMMARY_PILL_LIMIT', () => {
  it('matches notifier.rs format_region_summary cap (4 visible names)', () => {
    expect(REGION_SUMMARY_PILL_LIMIT).toBe(4)
  })
})

describe('alertTypeSeverity (mirrors notifier severity tiers)', () => {
  it('maps down to critical', () => {
    expect(alertTypeSeverity('down')).toBe('critical')
  })

  it('maps slow_timeout to high (not critical — probe failure, not site failure)', () => {
    expect(alertTypeSeverity('slow_timeout')).toBe('high')
  })

  it('maps ttfb_limit and ttfb_anomaly to high', () => {
    expect(alertTypeSeverity('ttfb_limit')).toBe('high')
    expect(alertTypeSeverity('ttfb_anomaly')).toBe('high')
  })

  it('maps cache_hit family (including trend drops) to medium', () => {
    expect(alertTypeSeverity('cache_hit_low')).toBe('medium')
    expect(alertTypeSeverity('cache_hit_trend_drop_region')).toBe('medium')
    expect(alertTypeSeverity('cache_hit_trend_drop_global')).toBe('medium')
  })

  it('falls back to low for ssl/anycast/trend/unknown', () => {
    expect(alertTypeSeverity('ssl_expiry')).toBe('low')
    expect(alertTypeSeverity('anycast')).toBe('low')
    expect(alertTypeSeverity('cache_age_alert')).toBe('low')
    expect(alertTypeSeverity('ttfb_trend_up_region')).toBe('low')
    expect(alertTypeSeverity('something_new')).toBe('low')
  })
})

describe('severityContext (mirrors email severity_context)', () => {
  it('returns the critical sentence for down alerts', () => {
    const ctx = severityContext('down')
    expect(ctx.label).toBe('Critical impact')
    expect(ctx.note).toContain('Service is unavailable')
  })

  it('returns the high impact sentence for TTFB alerts', () => {
    expect(severityContext('ttfb_limit').label).toBe('High impact')
    expect(severityContext('ttfb_anomaly').label).toBe('High impact')
  })

  it('returns the medium impact sentence for cache_hit alerts', () => {
    expect(severityContext('cache_hit_low').label).toBe('Medium impact')
  })

  it('returns the low impact sentence for ssl and anycast', () => {
    expect(severityContext('ssl_expiry').label).toBe('Low impact')
    expect(severityContext('anycast').label).toBe('Low impact')
  })

  it('never returns an empty label or note', () => {
    for (const t of [
      'down',
      'ttfb_limit',
      'ttfb_anomaly',
      'cache_hit_low',
      'ssl_expiry',
      'anycast',
      'cache_age_alert',
      'cache_hit_trend_drop_region',
      'ttfb_trend_up_region',
      'unknown_xpto',
    ]) {
      const ctx = severityContext(t)
      expect(ctx.label.length).toBeGreaterThan(0)
      expect(ctx.note.length).toBeGreaterThan(0)
    }
  })
})

describe('comparatorDisplay (mirrors notifier comparator_display)', () => {
  it('humanises the well-known slugs', () => {
    expect(comparatorDisplay('prev_hour')).toBe('previous hour')
    expect(comparatorDisplay('same_hour_prev_day')).toBe('same time yesterday')
    expect(comparatorDisplay('day_avg')).toBe('24h average')
  })

  it('falls back to "reference" for null/empty', () => {
    expect(comparatorDisplay(null)).toBe('reference')
    expect(comparatorDisplay(undefined)).toBe('reference')
    expect(comparatorDisplay('')).toBe('reference')
  })

  it('passes through unknown comparator values', () => {
    expect(comparatorDisplay('custom_cmp')).toBe('custom_cmp')
  })
})

describe('incidentStatus', () => {
  it('returns "New Alert" while no digest has been sent yet', () => {
    expect(incidentStatus(0, null).label).toBe('New Alert')
    expect(incidentStatus(1, null).label).toBe('New Alert')
    expect(incidentStatus(0, null).kind).toBe('new')
  })

  it('returns "Still Ongoing" after the first digest fires', () => {
    expect(incidentStatus(2, null).label).toBe('Still Ongoing')
    expect(incidentStatus(2, null).kind).toBe('ongoing')
    expect(incidentStatus(10, null).label).toBe('Still Ongoing')
  })

  it('returns "Snoozed" while snoozed_until is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(incidentStatus(3, future).label).toBe('Snoozed')
    expect(incidentStatus(3, future).kind).toBe('snoozed')
  })

  it('ignores stale snooze timestamps', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(incidentStatus(1, past).label).toBe('New Alert')
    expect(incidentStatus(5, past).label).toBe('Still Ongoing')
  })
})

describe('formatTimestamp', () => {
  it('renders a stable short timestamp', () => {
    const out = formatTimestamp('2026-05-12T08:30:00Z')
    expect(out).not.toBe('—')
    expect(out.length).toBeGreaterThan(0)
  })

  it('returns the em-dash placeholder for empty/invalid inputs', () => {
    expect(formatTimestamp(null)).toBe('—')
    expect(formatTimestamp(undefined)).toBe('—')
    expect(formatTimestamp('not-a-date')).toBe('—')
  })
})

describe('metric helpers parity with the email body', () => {
  it('isCacheMetric covers the cache_hit family only', () => {
    expect(isCacheMetric('cache_hit_low')).toBe(true)
    expect(isCacheMetric('cache_hit_trend_drop_region')).toBe(true)
    expect(isCacheMetric('ttfb_limit')).toBe(false)
    expect(isCacheMetric('down')).toBe(false)
  })

  it('isCacheHitTrendDrop covers only the two trend drop slugs', () => {
    expect(isCacheHitTrendDrop('cache_hit_trend_drop_region')).toBe(true)
    expect(isCacheHitTrendDrop('cache_hit_trend_drop_global')).toBe(true)
    expect(isCacheHitTrendDrop('cache_hit_low')).toBe(false)
  })

  it('metricUnit returns the correct suffix', () => {
    expect(metricUnit('cache_hit_low')).toBe('%')
    expect(metricUnit('cache_hit_trend_drop_global')).toBe('%')
    expect(metricUnit('ttfb_limit')).toBe('ms')
    expect(metricUnit('down')).toBe('ms')
  })

  it('formatMetricValue uses the right unit and precision', () => {
    expect(formatMetricValue(78.456, 'cache_hit_low')).toBe('78.5%')
    expect(formatMetricValue(342.6, 'ttfb_limit')).toBe('343ms')
  })

  // Smoke-test re-exported behavior to catch accidental contract breaks.
  it('formatMetricDelta matches the email copy', () => {
    expect(formatMetricDelta(65, 80, 'cache_hit_low')).toBe('15.0% below target')
    expect(formatMetricDelta(350, 200, 'ttfb_limit')).toBe('150ms above limit')
  })

  it('formatDuration matches the email duration phrasing', () => {
    expect(formatDuration(60_000)).toBe('1 minute')
    expect(formatDuration(3_600_000)).toBe('1 hour')
    expect(formatDuration(86_400_000)).toBe('1 day')
  })
})

describe('alertTypeDisplay', () => {
  it('renders all known slugs with no snake_case', () => {
    const slugs = [
      'down',
      'slow_timeout',
      'ttfb_limit',
      'ttfb_anomaly',
      'cache_hit_low',
      'ssl_expiry',
      'cache_age_alert',
      'anycast',
      'cache_hit_trend_drop_region',
      'cache_hit_trend_drop_global',
      'ttfb_trend_up_region',
      'ttfb_trend_up_global',
      'ttfb_trend_down_region',
      'ttfb_trend_down_global',
    ]
    for (const s of slugs) {
      const display = alertTypeDisplay(s)
      expect(display).not.toContain('_')
      expect(display).not.toBe('Unknown Alert')
    }
  })

  it('falls back to "Unknown Alert" for unrecognised slugs', () => {
    expect(alertTypeDisplay('xpto')).toBe('Unknown Alert')
    expect(alertTypeDisplay('')).toBe('Unknown Alert')
  })

  it('renders slow_timeout with the explicit "Probe Timeout" label', () => {
    // Mirrors api/src/alerts/severity.rs::alert_type_display("slow_timeout")
    expect(alertTypeDisplay('slow_timeout')).toBe('Slow Response (Probe Timeout)')
  })
})
