import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/health/overview')

  const since5m = new Date(Date.now() - 5 * 60 * 1000)

  const [regions, activeMonitors, recentByRegion] = await Promise.all([
    sql<{ id: string; label: string }[]>`
      SELECT id, label FROM regions WHERE enabled = true ORDER BY id
    `,
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM monitors WHERE is_active = true
    `,
    sql<{ region: string; count: number }[]>`
      SELECT region, COUNT(*)::int AS count
      FROM probe_results
      WHERE time > ${since5m}
      GROUP BY region
    `,
  ])

  const regionIds = regions.map(r => r.id)
  const activeRegions = new Set(recentByRegion.map(r => r.region))
  const silentRegions = regionIds.filter(id => !activeRegions.has(id))
  const totalProbes5m = recentByRegion.reduce((s, r) => s + r.count, 0)

  let status: 'healthy' | 'warning' | 'critical' | 'unknown'
  if (regionIds.length === 0) {
    status = 'unknown'
  } else if (silentRegions.length === 0) {
    status = 'healthy'
  } else if (silentRegions.length < regionIds.length) {
    status = 'warning'
  } else {
    status = 'critical'
  }

  return NextResponse.json({
    regions: regionIds,
    data: {
      status,
      active_monitors: activeMonitors[0]?.count ?? 0,
      recent_probes_5m: totalProbes5m,
      regions_active: activeRegions.size,
      regions_silent: silentRegions,
      last_updated: new Date().toISOString(),
    },
  })
}
