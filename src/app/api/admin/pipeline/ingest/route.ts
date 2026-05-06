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

  await logAdminAccess(admin.id, '/api/admin/pipeline/ingest')

  const windowParam = request.nextUrl.searchParams.get('window') ?? '15m'
  const windowMinutes = WINDOW_MINUTES[windowParam] ?? 15
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)

  const [regions, totals, byRegion] = await Promise.all([
    sql<{ id: string }[]>`
      SELECT id FROM regions WHERE enabled = true ORDER BY id
    `,
    sql<{ total: number; success: number; failed: number }[]>`
      SELECT
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (WHERE error IS NULL OR error = '')::int              AS success,
        COUNT(*) FILTER (WHERE error IS NOT NULL AND error != '')::int        AS failed
      FROM probe_results
      WHERE time > ${since}
    `,
    sql<{ region: string; total: number; success: number; failed: number }[]>`
      SELECT
        region,
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (WHERE error IS NULL OR error = '')::int              AS success,
        COUNT(*) FILTER (WHERE error IS NOT NULL AND error != '')::int        AS failed
      FROM probe_results
      WHERE time > ${since}
      GROUP BY region
      ORDER BY region
    `,
  ])

  const regionIds = regions.map(r => r.id)
  const total = totals[0]?.total ?? 0
  const success = totals[0]?.success ?? 0
  const failed = totals[0]?.failed ?? 0
  const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : null

  return NextResponse.json({
    regions: regionIds,
    data: {
      window: windowParam,
      total,
      success,
      failed,
      success_rate: successRate,
      by_region: byRegion,
    },
  })
}
