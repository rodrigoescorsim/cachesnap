/**
 * Single source of truth for timing metric colors across Real-time, Trends, and Diagnostics (waterfall).
 * DNS purple, TCP blue, TLS fuchsia, TTFB emerald, Edge sky (lighter cyan-blue vs TCP royal blue), Origin amber, Download lime.
 */
export const TIMING = {
  dns: {
    text: 'text-purple-600 dark:text-purple-400',
    bar: 'bg-purple-500',
    barFill: 'bg-purple-400 dark:bg-purple-500',
    stroke: '#a855f7',
  },
  tcp: {
    text: 'text-blue-700 dark:text-blue-400',
    bar: 'bg-blue-600',
    barFill: 'bg-blue-500 dark:bg-blue-600',
    stroke: '#1e40af',
  },
  tls: {
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
    bar: 'bg-fuchsia-500',
    barFill: 'bg-fuchsia-400 dark:bg-fuchsia-500',
    stroke: '#d946ef',
  },
  ttfb: {
    text: 'text-emerald-500 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    barFill: 'bg-emerald-400 dark:bg-emerald-500',
    stroke: '#10b981',
  },
  download: {
    text: 'text-lime-600 dark:text-lime-400',
    bar: 'bg-lime-400',
    barFill: 'bg-lime-300 dark:bg-lime-400',
    stroke: '#a3e635',
  },
  edge: {
    text: 'text-cyan-600 dark:text-cyan-400',
    bar: 'bg-cyan-400',
    barFill: 'bg-cyan-300 dark:bg-cyan-400',
    stroke: '#22d3ee',
  },
  origin: {
    text: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
    barFill: 'bg-orange-400 dark:bg-orange-500',
    stroke: '#ea580c',
  },
  total: {
    text: 'text-zinc-600 dark:text-zinc-400',
  },
} as const
