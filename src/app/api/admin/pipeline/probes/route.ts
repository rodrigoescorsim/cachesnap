import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

const WINDOW_MINUTES: Record<string, number> = {
  '15m': 15,
  '1h': 60,
  '24h': 1440,
  '7d': 10080,
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/pipeline/probes')

  const windowParam = request.nextUrl.searchParams.get('window') ?? '15m'
  const windowMinutes = WINDOW_MINUTES[windowParam] ?? 15
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)
  // A region is "silent" if its last probe is older than 2× the minimum check interval (60s)
  const silentThreshold = new Date(Date.now() - 2 * 60 * 1000)

  // Three parallel queries: regions list, stats (ttfb_ms only), last-seen (all probes)
  // Silent detection uses last-seen so error-only probes don't silently mark a region.
  const [regions, byRegion, lastSeenByRegion] = await Promise.all([
    sql<{ id: string }[]>`
      SELECT id FROM regions WHERE enabled = true ORDER BY id
    `,
    sql<{
      region: string
      probe_count: number
      avg_ttfb_ms: number | null
      p95_ttfb_ms: number | null
    }[]>`
      SELECT
        region,
        COUNT(*)::int                                                        AS probe_count,
        AVG(ttfb_ms)                                                         AS avg_ttfb_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb_ms)               AS p95_ttfb_ms
      FROM probe_results
      WHERE time > ${since}
        AND ttfb_ms IS NOT NULL
      GROUP BY region
      ORDER BY region
    `,
    // Separate query without ttfb_ms filter — includes error probes for accurate silent detection
    sql<{ region: string; last_seen: Date }[]>`
      SELECT region, MAX(time) AS last_seen
      FROM probe_results
      WHERE time > ${since}
      GROUP BY region
    `,
  ])

  const regionIds = regions.map(r => r.id)
  const lastSeenMap = new Map(lastSeenByRegion.map(r => [r.region, r.last_seen]))

  const silentRegions = regionIds.filter(id => {
    const lastSeen = lastSeenMap.get(id)
    if (!lastSeen) return true
    return new Date(lastSeen) < silentThreshold
  })

  const enriched = byRegion.map(r => ({
    region: r.region,
    probe_count: r.probe_count,
    avg_ttfb_ms: r.avg_ttfb_ms !== null ? Math.round(Number(r.avg_ttfb_ms)) : null,
    p95_ttfb_ms: r.p95_ttfb_ms !== null ? Math.round(Number(r.p95_ttfb_ms)) : null,
    last_seen: lastSeenMap.has(r.region)
      ? new Date(lastSeenMap.get(r.region)!).toISOString()
      : null,
  }))

  return NextResponse.json({
    regions: regionIds,
    data: {
      window: windowParam,
      by_region: enriched,
      silent_regions: silentRegions,
    },
  })
}
