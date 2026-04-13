/**
 * Pure helper functions for the probe waterfall visualization.
 * Kept separate from the JSX component so they can be unit-tested in Node.
 */

/** Returns a CSS percentage string for a bar segment, clamped to [0.5%, 100%] to avoid invisible slivers. */
export function pct(value: number, total: number): string {
  if (total <= 0) return '0%'
  const raw = (value / total) * 100
  if (raw <= 0) return '0%'
  return `${Math.max(0.5, Math.min(100, raw)).toFixed(2)}%`
}

/**
 * Returns sorted, non-zero Server-Timing breakdown entries.
 * Values from the DB may arrive as numbers or strings; both are coerced.
 */
export function breakdownEntries(
  raw: Record<string, number> | null,
): Array<[string, number]> {
  if (!raw) return []
  return Object.entries(raw)
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
}

// Semantic color map: first matching substring wins (aligned with timing-metrics-palette)
const BREAKDOWN_COLOR_MAP: Array<[string, string]> = [
  ['db', 'bg-red-400'],
  ['database', 'bg-red-400'],
  ['sql', 'bg-red-400'],
  ['tcp', 'bg-blue-500'],
  // Match Edge in timing-metrics-palette
  ['edge', 'bg-[#38bdf8]'],
  ['cdn', 'bg-[#38bdf8]'],
  ['cf', 'bg-[#38bdf8]'],
  ['auth', 'bg-violet-400'],
  ['worker', 'bg-violet-400'],
  ['cache', 'bg-violet-400'],
  ['hit', 'bg-violet-500'],
  ['miss', 'bg-amber-500'],
  ['origin', 'bg-amber-500'],
  ['app', 'bg-amber-500'],
  ['server', 'bg-amber-500'],
  ['render', 'bg-orange-400'],
  ['next', 'bg-orange-400'],
]

/** Returns a Tailwind bg-* class for a Server-Timing entry name. */
export function breakdownColor(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, cls] of BREAKDOWN_COLOR_MAP) {
    if (lower.includes(key)) return cls
  }
  return 'bg-zinc-400'
}

/** Returns Tailwind classes for a cache status badge. */
export function cacheClass(status: string | null): string {
  const s = status?.toUpperCase()
  if (s === 'HIT') return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
  if (s === 'MISS') return 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
  if (s === 'BYPASS' || s === 'DYNAMIC')
    return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/50'
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700/50'
}

/**
 * Formats a cache age in seconds to a human-readable string.
 * Returns null if age is absent or zero.
 */
export function formatAge(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
