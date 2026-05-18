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
