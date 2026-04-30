/**
 * Pure helpers for the Edge Audit / bypass-audit component.
 * Extracted here so they can be unit-tested without mounting React.
 */

export type AuditStateValue = 'disabled' | 'warmup' | 'enabled'

export interface AuditReadiness {
  state: AuditStateValue
  reason: string | null
  comparable_pairs: number
  comparable_regions: number
  edge_hit_ratio: number
  updated_at: Date | null
}

export const COMPARABLE_PAIRS_GATE = 8
export const COMPARABLE_REGIONS_GATE = 4

// ── State resolution ──────────────────────────────────────────────────────────

/**
 * Resolves the canonical audit state from a readiness payload.
 * Returns 'enabled' when readiness is absent (backward-compat for monitors
 * that pre-date the readiness engine).
 */
export function resolveReadinessState(readiness: AuditReadiness | null | undefined): AuditStateValue {
  if (!readiness) return 'enabled'
  const s = readiness.state
  if (s === 'warmup' || s === 'enabled' || s === 'disabled') return s
  return 'disabled'
}

/**
 * Returns the reason text provided by the backend.
 * Falls back to a generic message when absent.
 */
export function resolveReason(readiness: AuditReadiness | null | undefined): string {
  return readiness?.reason ?? ''
}

// ── Banner visibility ─────────────────────────────────────────────────────────

/** Banner (reason card) should appear whenever audit is not fully enabled. */
export function shouldShowBanner(readiness: AuditReadiness | null | undefined): boolean {
  const state = resolveReadinessState(readiness)
  return state !== 'enabled'
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export interface AuditBadge {
  label: string
  cssClass: string
}

/**
 * Returns the badge label and CSS class for the current readiness state.
 * Uses the design-system badge classes: cs-badge-success / warning / muted.
 */
export function formatAuditBadge(readiness: AuditReadiness | null | undefined): AuditBadge {
  const state = resolveReadinessState(readiness)
  switch (state) {
    case 'enabled':
      return { label: 'Active', cssClass: 'cs-badge cs-badge-success' }
    case 'warmup':
      return { label: 'Warming Up', cssClass: 'cs-badge cs-badge-warning' }
    case 'disabled':
    default:
      return { label: 'Unavailable', cssClass: 'cs-badge cs-badge-muted' }
  }
}

// ── CTA ───────────────────────────────────────────────────────────────────────

/** Audit button should only be enabled when the system is fully active. */
export function isAuditButtonEnabled(readiness: AuditReadiness | null | undefined): boolean {
  return resolveReadinessState(readiness) === 'enabled'
}

// ── Warmup progress ───────────────────────────────────────────────────────────

/**
 * Progress toward the comparable_pairs gate (0–100).
 * Returns 0 when readiness is absent or state is not warmup.
 */
export function warmupProgressPercent(readiness: AuditReadiness | null | undefined): number {
  if (!readiness || readiness.state !== 'warmup') return 0
  return Math.min(Math.round((readiness.comparable_pairs / COMPARABLE_PAIRS_GATE) * 100), 100)
}

/**
 * How many comparable pairs are still needed to reach the gate.
 */
export function remainingPairsNeeded(readiness: AuditReadiness | null | undefined): number {
  if (!readiness) return COMPARABLE_PAIRS_GATE
  return Math.max(COMPARABLE_PAIRS_GATE - readiness.comparable_pairs, 0)
}

// ── Timeline snapshot ─────────────────────────────────────────────────────────

export interface SnapshotReadiness {
  comparableRegions: number
  confidence: 'low' | 'medium' | 'high'
  state: AuditStateValue
}

/**
 * Formats readiness context for a timeline snapshot given live readiness data.
 * In v1 the readiness is global (not per-snapshot), so we forward the live state.
 */
export function formatSnapshotReadiness(
  readiness: AuditReadiness | null | undefined,
): SnapshotReadiness {
  const state = resolveReadinessState(readiness)
  const pairs = readiness?.comparable_pairs ?? 0
  const regions = readiness?.comparable_regions ?? 0

  const confidence: 'low' | 'medium' | 'high' =
    pairs >= COMPARABLE_PAIRS_GATE && regions >= COMPARABLE_REGIONS_GATE
      ? 'high'
      : pairs >= COMPARABLE_PAIRS_GATE / 2
        ? 'medium'
        : 'low'

  return { comparableRegions: regions, confidence, state }
}
