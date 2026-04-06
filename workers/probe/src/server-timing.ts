export interface ServerTimingMetrics {
  edge_ms: number | null
  origin_ms: number | null
}

export function parseServerTiming(header: string | null, xTimer?: string | null): ServerTimingMetrics {
  let edge_ms: number | null = null
  let origin_ms: number | null = null

  // 1. Tentar o padrão oficial (Server-Timing)
  if (header) {
    for (const entry of header.split(',')) {
      const parts = entry.trim().split(';')
      const name = parts[0].toLowerCase()

      const durMatch = entry.match(/dur=([\d.]+)/i)
      if (durMatch) {
        const duration = Math.round(parseFloat(durMatch[1]) * 100) / 100

        const isEdge = name.includes('edge') || name.includes('cdn') || name.includes('cache') || name.includes('hit') || name.includes('cf')
        const isOrigin = name.includes('origin') || name.includes('app') || name.includes('server') || name.includes('back') || name.includes('miss') || name.includes('host') || name.includes('upstream')

        if (isEdge && edge_ms === null) edge_ms = duration
        else if (isOrigin && origin_ms === null) origin_ms = duration
      }
    }
  }

  // 2. Hack: Se não houver Server-Timing, tentar o x-timer da Fastly (NY Times / GitHub)
  // Formato: S123.45,VS0,VE227 -> VE é o "VCL End", tempo total na CDN.
  if (edge_ms === null && xTimer) {
    const veMatch = xTimer.match(/VE([\d.]+)/i)
    if (veMatch) {
      edge_ms = Math.round(parseFloat(veMatch[1]) * 100) / 100
    }
  }

  return { edge_ms, origin_ms }
}
