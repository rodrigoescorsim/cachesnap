import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/fleet/status')

  const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const [regions, latestByRegion] = await Promise.all([
    sql<{ id: string }[]>`
      SELECT id FROM regions WHERE enabled = true ORDER BY id
    `,
    // DISTINCT ON: latest probe per region with a version tag
    sql<{ region: string; version: string; last_seen: Date }[]>`
      SELECT DISTINCT ON (region)
        region,
        probe_version AS version,
        time          AS last_seen
      FROM probe_results
      WHERE probe_version IS NOT NULL
        AND time > ${since2h}
      ORDER BY region, time DESC
    `,
  ])

  const regionIds = regions.map(r => r.id)

  // Canonical = version with the most recent probe. Tiebreak by region name (deterministic).
  const canonical =
    latestByRegion.length > 0
      ? latestByRegion
          .slice()
          .sort((a, b) => {
            const diff = new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
            return diff !== 0 ? diff : a.region.localeCompare(b.region)
          })[0].version
      : null

  const regionMap = new Map(latestByRegion.map(r => [r.region, r]))

  const byRegion = regionIds.map(id => {
    const info = regionMap.get(id)
    return {
      region: id,
      version: info?.version ?? null,
      is_canonical: info?.version === canonical,
      last_seen: info ? new Date(info.last_seen).toISOString() : null,
    }
  })

  const driftCount = byRegion.filter(r => r.version !== null && !r.is_canonical).length

  return NextResponse.json({
    regions: regionIds,
    data: {
      canonical_version: canonical,
      drift_count: driftCount,
      by_region: byRegion,
    },
  })
}
