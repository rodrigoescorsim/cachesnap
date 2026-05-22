export const PLAN_LIMITS = {
  free: { monitors: 2,   historyDays: 7  },
  pro:  { monitors: 20,  historyDays: 30 },
  team: { monitors: 100, historyDays: 90 },
} as const

export type Plan = keyof typeof PLAN_LIMITS

const VALID_PLANS = new Set<string>(Object.keys(PLAN_LIMITS))

export function parsePlan(raw: string | null | undefined): Plan {
  if (raw && VALID_PLANS.has(raw)) return raw as Plan
  return 'free'
}

export function getMonitorLimit(plan: string): number {
  return PLAN_LIMITS[parsePlan(plan)].monitors
}

export function getHistoryDays(plan: string): number {
  return PLAN_LIMITS[parsePlan(plan)].historyDays
}

export const RANGE_DAYS: Record<string, number> = {
  '1h': 1, '4h': 1, '1d': 1, '24h': 1, '7d': 7, '30d': 30, '90d': 90,
}

export function capRangeToHistoryDays(range: string, historyDays: number): string {
  if ((RANGE_DAYS[range] ?? 1) <= historyDays) return range
  if (historyDays >= 90) return '90d'
  if (historyDays >= 30) return '30d'
  return '7d'
}
