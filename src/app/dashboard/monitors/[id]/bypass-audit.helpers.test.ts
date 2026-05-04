import { describe, it, expect } from 'vitest'
import {
  resolveReadinessState,
  resolveReason,
  shouldShowBanner,
  formatAuditBadge,
  isAuditButtonEnabled,
  warmupProgressPercent,
  remainingPairsNeeded,
  formatSnapshotReadiness,
  globalImpactEmptyStateCopy,
  regionalBenefitPendingLabel,
  edgeAuditDisabledBannerBody,
  type AuditReadiness,
} from './bypass-audit.helpers'

function makeReadiness(overrides: Partial<AuditReadiness> = {}): AuditReadiness {
  return {
    state: 'disabled',
    reason: null,
    comparable_pairs: 0,
    comparable_regions: 0,
    edge_hit_ratio: 0,
    updated_at: null,
    ...overrides,
  }
}

// ── resolveReadinessState ─────────────────────────────────────────────────────

describe('resolveReadinessState', () => {
  it('returns "enabled" when readiness is null (backward compat)', () => {
    expect(resolveReadinessState(null)).toBe('enabled')
    expect(resolveReadinessState(undefined)).toBe('enabled')
  })

  it('returns the state from the readiness payload', () => {
    expect(resolveReadinessState(makeReadiness({ state: 'disabled' }))).toBe('disabled')
    expect(resolveReadinessState(makeReadiness({ state: 'warmup' }))).toBe('warmup')
    expect(resolveReadinessState(makeReadiness({ state: 'enabled' }))).toBe('enabled')
  })

  it('falls back to "disabled" for unknown state strings', () => {
    // @ts-expect-error testing runtime safety
    expect(resolveReadinessState(makeReadiness({ state: 'unknown' }))).toBe('disabled')
  })
})

// ── resolveReason ─────────────────────────────────────────────────────────────

describe('resolveReason', () => {
  it('returns the backend reason string', () => {
    const r = makeReadiness({ reason: 'No verified edge cache hits yet.' })
    expect(resolveReason(r)).toBe('No verified edge cache hits yet.')
  })

  it('returns empty string when reason is null', () => {
    expect(resolveReason(makeReadiness({ reason: null }))).toBe('')
  })

  it('returns empty string when readiness is null', () => {
    expect(resolveReason(null)).toBe('')
  })
})

// ── edgeAuditDisabledBannerBody ────────────────────────────────────────────────

describe('edgeAuditDisabledBannerBody', () => {
  it('returns backend reason for dynamic / BYPASS monitors', () => {
    const msg = 'Target URL is consistently dynamic (BYPASS).'
    expect(edgeAuditDisabledBannerBody(makeReadiness({ reason: msg }))).toBe(msg)
  })

  it('returns canonical cache-signal copy for generic disabled reasons', () => {
    const body = edgeAuditDisabledBannerBody(
      makeReadiness({ reason: 'Insufficient data — waiting for probes from all regions.' }),
    )
    expect(body).toContain('HIT/MISS')
    expect(body).toContain('strip or hide')
  })
})

// ── shouldShowBanner ──────────────────────────────────────────────────────────

describe('shouldShowBanner', () => {
  it('returns true for disabled state', () => {
    expect(shouldShowBanner(makeReadiness({ state: 'disabled' }))).toBe(true)
  })

  it('returns true for warmup state', () => {
    expect(shouldShowBanner(makeReadiness({ state: 'warmup' }))).toBe(true)
  })

  it('returns false for enabled state', () => {
    expect(shouldShowBanner(makeReadiness({ state: 'enabled' }))).toBe(false)
  })

  it('returns false when readiness is null (backward compat — assume enabled)', () => {
    expect(shouldShowBanner(null)).toBe(false)
  })
})

// ── formatAuditBadge ──────────────────────────────────────────────────────────

describe('formatAuditBadge', () => {
  it('returns success badge for enabled state', () => {
    const badge = formatAuditBadge(makeReadiness({ state: 'enabled' }))
    expect(badge.label).toBe('Active')
    expect(badge.cssClass).toContain('cs-badge-success')
  })

  it('returns warning badge for warmup state', () => {
    const badge = formatAuditBadge(makeReadiness({ state: 'warmup' }))
    expect(badge.label).toBe('Warming Up')
    expect(badge.cssClass).toContain('cs-badge-warning')
  })

  it('returns muted badge for disabled state', () => {
    const badge = formatAuditBadge(makeReadiness({ state: 'disabled' }))
    expect(badge.label).toBe('Unavailable')
    expect(badge.cssClass).toContain('cs-badge-muted')
  })

  it('returns success badge when readiness is null (backward compat)', () => {
    const badge = formatAuditBadge(null)
    expect(badge.cssClass).toContain('cs-badge-success')
  })
})

// ── isAuditButtonEnabled ──────────────────────────────────────────────────────

describe('isAuditButtonEnabled', () => {
  it('returns false for disabled state', () => {
    expect(isAuditButtonEnabled(makeReadiness({ state: 'disabled' }))).toBe(false)
  })

  it('returns false for warmup state', () => {
    expect(isAuditButtonEnabled(makeReadiness({ state: 'warmup' }))).toBe(false)
  })

  it('returns true for enabled state', () => {
    expect(isAuditButtonEnabled(makeReadiness({ state: 'enabled' }))).toBe(true)
  })

  it('returns true when readiness is null (backward compat)', () => {
    expect(isAuditButtonEnabled(null)).toBe(true)
  })
})

// ── warmupProgressPercent ─────────────────────────────────────────────────────

describe('warmupProgressPercent', () => {
  it('returns 0 when not in warmup state', () => {
    expect(warmupProgressPercent(makeReadiness({ state: 'disabled', comparable_pairs: 5 }))).toBe(0)
    expect(warmupProgressPercent(makeReadiness({ state: 'enabled', comparable_pairs: 8 }))).toBe(0)
    expect(warmupProgressPercent(null)).toBe(0)
  })

  it('returns 0 when no pairs collected', () => {
    expect(warmupProgressPercent(makeReadiness({ state: 'warmup', comparable_pairs: 0 }))).toBe(0)
  })

  it('returns proportional percent (gate = 8)', () => {
    expect(warmupProgressPercent(makeReadiness({ state: 'warmup', comparable_pairs: 4 }))).toBe(50)
    expect(warmupProgressPercent(makeReadiness({ state: 'warmup', comparable_pairs: 2 }))).toBe(25)
    expect(warmupProgressPercent(makeReadiness({ state: 'warmup', comparable_pairs: 7 }))).toBe(88)
  })

  it('caps at 100', () => {
    expect(warmupProgressPercent(makeReadiness({ state: 'warmup', comparable_pairs: 10 }))).toBe(100)
  })
})

// ── remainingPairsNeeded ──────────────────────────────────────────────────────

describe('remainingPairsNeeded', () => {
  it('returns full gate when readiness is null', () => {
    expect(remainingPairsNeeded(null)).toBe(8)
  })

  it('returns correct remaining count', () => {
    expect(remainingPairsNeeded(makeReadiness({ comparable_pairs: 5 }))).toBe(3)
    expect(remainingPairsNeeded(makeReadiness({ comparable_pairs: 0 }))).toBe(8)
  })

  it('returns 0 when gate reached', () => {
    expect(remainingPairsNeeded(makeReadiness({ comparable_pairs: 8 }))).toBe(0)
    expect(remainingPairsNeeded(makeReadiness({ comparable_pairs: 12 }))).toBe(0)
  })
})

// ── formatSnapshotReadiness ───────────────────────────────────────────────────

describe('formatSnapshotReadiness', () => {
  it('returns low confidence when pairs are insufficient', () => {
    const result = formatSnapshotReadiness(makeReadiness({ state: 'warmup', comparable_pairs: 2, comparable_regions: 1 }))
    expect(result.confidence).toBe('low')
    expect(result.state).toBe('warmup')
    expect(result.comparableRegions).toBe(1)
  })

  it('returns medium confidence with moderate pairs', () => {
    const result = formatSnapshotReadiness(makeReadiness({ state: 'warmup', comparable_pairs: 5, comparable_regions: 3 }))
    expect(result.confidence).toBe('medium')
  })

  it('returns high confidence when gates are met', () => {
    const result = formatSnapshotReadiness(makeReadiness({ state: 'enabled', comparable_pairs: 8, comparable_regions: 4 }))
    expect(result.confidence).toBe('high')
    expect(result.state).toBe('enabled')
  })

  it('handles null readiness gracefully', () => {
    const result = formatSnapshotReadiness(null)
    expect(result.state).toBe('enabled')
    expect(result.confidence).toBe('low')
    expect(result.comparableRegions).toBe(0)
  })
})

// ── copy helpers ───────────────────────────────────────────────────────────────

describe('globalImpactEmptyStateCopy', () => {
  it('returns warmup-specific copy', () => {
    const copy = globalImpactEmptyStateCopy('warmup', '24H')
    expect(copy.title).toBe('Collecting comparable pairs')
    expect(copy.subtitle).toBe('Need more comparable samples in 24H')
  })

  it('returns default empty-state copy for enabled/disabled', () => {
    expect(globalImpactEmptyStateCopy('enabled', '7D')).toEqual({
      title: 'No comparison yet',
      subtitle: 'No comparable samples in 7D',
    })
    expect(globalImpactEmptyStateCopy('disabled', '7D')).toEqual({
      title: 'No comparison yet',
      subtitle: 'No comparable samples in 7D',
    })
  })
})

describe('regionalBenefitPendingLabel', () => {
  it('returns not-comparable label when origin has signal', () => {
    expect(regionalBenefitPendingLabel(true)).toBe('Not comparable yet')
  })

  it('returns needs-samples label when origin has no signal', () => {
    expect(regionalBenefitPendingLabel(false)).toBe('Need more comparable samples')
  })
})
