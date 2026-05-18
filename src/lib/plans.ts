export const PLAN_LIMITS = {
  free: { monitors: 2,   historyDays: 7  },
  pro:  { monitors: 20,  historyDays: 30 },
  team: { monitors: 100, historyDays: 90 },
} as const

export type Plan = keyof typeof PLAN_LIMITS

export function getMonitorLimit(plan: string): number {
  return PLAN_LIMITS[plan as Plan]?.monitors ?? PLAN_LIMITS.free.monitors
}
