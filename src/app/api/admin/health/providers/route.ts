import { NextResponse } from 'next/server'
import { getAdminSession, logAdminAccess } from '@/lib/admin-auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

type ProviderStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

interface ProviderEntry {
  name: string
  status: ProviderStatus
  detail: string
  error_count_15m: number | null
  last_success_age_s: number | null
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return unauthorized()

  await logAdminAccess(admin.id, '/api/admin/health/providers')

  const since15m = new Date(Date.now() - 15 * 60 * 1000)

  const [regions, regionErrors] = await Promise.all([
    sql<{ id: string }[]>`
      SELECT id FROM regions WHERE enabled = true ORDER BY id
    `,
    sql<{ region: string; error_count: number; total: number }[]>`
      SELECT
        region,
        COUNT(*) FILTER (WHERE error IS NOT NULL AND error != '')::int AS error_count,
        COUNT(*)::int AS total
      FROM probe_results
      WHERE time > ${since15m}
      GROUP BY region
    `,
  ])

  const regionIds = regions.map(r => r.id)
  const regionMap = new Map(regionErrors.map(r => [r.region, r]))

  const providers: ProviderEntry[] = [
    // Resend: no delivery log table yet — mark unknown
    {
      name: 'Resend',
      status: 'unknown',
      detail: 'Delivery log not yet implemented',
      error_count_15m: null,
      last_success_age_s: null,
    },
  ]

  for (const regionId of regionIds) {
    const info = regionMap.get(regionId)

    if (!info) {
      providers.push({
        name: `Lambda ${regionId}`,
        status: 'unknown',
        detail: 'No probes in last 15 min',
        error_count_15m: null,
        last_success_age_s: null,
      })
      continue
    }

    const errorCount = Number(info.error_count)
    const total = Number(info.total)
    const errorRate = total > 0 ? errorCount / total : 0

    providers.push({
      name: `Lambda ${regionId}`,
      status: errorRate === 0 ? 'healthy' : errorRate < 0.1 ? 'warning' : 'critical',
      detail: `${errorCount} errors / ${total} probes`,
      error_count_15m: errorCount,
      last_success_age_s: null,
    })
  }

  const hasCritical = providers.some(p => p.status === 'critical')

  return NextResponse.json({
    regions: regionIds,
    data: { providers, has_critical: hasCritical },
  })
}
