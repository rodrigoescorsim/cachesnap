/**
 * Industrial-grade metrics math utilities for CacheSnap.
 * Includes EMA (Exponential Moving Average) implementation for trend analysis.
 */

/**
 * Calculates a standard Trend Percentage between a current signal and a baseline.
 * (Signal - Baseline) / Baseline * 100
 */
export function calculateTrend(signal: number, baseline: number): number {
  if (baseline === 0) return 0
  return Number((((signal - baseline) / baseline) * 100).toFixed(1))
}

/**
 * Exponential Moving Average (EMA) implementation.
 * @param current - The latest measurement value
 * @param previousEma - The EMA calculated in the previous step
 * @param period - The smoothing period (N). Higher = smoother/slower, Lower = more reactive.
 * @returns The new EMA value
 */
export function calculateEMA(current: number, previousEma: number, period: number = 10): number {
  const alpha = 2 / (period + 1)
  return current * alpha + previousEma * (1 - alpha)
}

/**
 * Health Score weighing logic.
 * Combines multiple factors into a centralized resilience score.
 */
export function calculateWeightedHealthScore(monitors: { health: number }[]): number {
  if (monitors.length === 0) return 0
  const sum = monitors.reduce((acc, m) => acc + m.health, 0)
  return Math.round(sum / monitors.length)
}
