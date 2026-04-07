export interface ServerTimingMetrics {
  edge_ms: number | null
  origin_ms: number | null
  /** All named Server-Timing entries that have a `dur=` value, keyed by metric name. */
  breakdown: Record<string, number> | null
}

export function parseServerTiming(header: string | null, xTimer?: string | null): ServerTimingMetrics {
  let edge_ms: number | null = null
  let origin_ms: number | null = null
  const breakdown: Record<string, number> = {}

  // 1. Parse official Server-Timing header
  if (header) {
    for (const entry of header.split(',')) {
      const parts = entry.trim().split(';')
      const name = parts[0].trim().toLowerCase()

      const durMatch = entry.match(/dur=([\d.]+)/i)
      if (durMatch) {
        const duration = Math.round(parseFloat(durMatch[1]) * 100) / 100

        // Store in full breakdown (all named entries with dur=)
        if (name) breakdown[name] = duration

        const isEdge = name.includes('edge') || name.includes('cdn') || name.includes('cache') || name.includes('hit') || name.includes('cf')
        const isOrigin = name.includes('origin') || name.includes('app') || name.includes('server') || name.includes('back') || name.includes('miss') || name.includes('host') || name.includes('upstream')

        if (isEdge && edge_ms === null) edge_ms = duration
        else if (isOrigin && origin_ms === null) origin_ms = duration
      }
    }
  }

  // 2. Fastly X-Timer fallback (NY Times / GitHub format: S123.45,VS0,VE227)
  // VE = "VCL End" — total time spent in Fastly CDN
  if (edge_ms === null && xTimer) {
    const veMatch = xTimer.match(/VE([\d.]+)/i)
    if (veMatch) {
      edge_ms = Math.round(parseFloat(veMatch[1]) * 100) / 100
    }
  }

  return {
    edge_ms,
    origin_ms,
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : null,
  }
}
