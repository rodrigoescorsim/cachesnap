export type MonitorStatus = 'active' | 'paused'
export type TtfbTier = 'fast' | 'med' | 'slow'
export type CacheHitTier = 'high' | 'mid' | 'low'

export interface MonitorRegion {
  code: string
  flag: string
  label: string
  isSlow: boolean
}

export interface Monitor {
  id: string
  name: string
  url: string
  status: MonitorStatus
  ttfbCurrent: number
  ttfbCurrentDelta: number
  ttfbAvg24h: number
  ttfbSparkline: number[]
  cacheHitCurrent: number
  cacheHitAvg24h: number
  cacheHitDelta: number
  regions: MonitorRegion[]
  slowRegionCount: number
  totalRegionCount: number
  lastCheckedAt: Date
}

export function getTtfbTier(ms: number): TtfbTier {
  if (ms < 150) return 'fast'
  if (ms <= 300) return 'med'
  return 'slow'
}

export function getCacheHitTier(pct: number): CacheHitTier {
  if (pct > 90) return 'high'
  if (pct >= 70) return 'mid'
  return 'low'
}
