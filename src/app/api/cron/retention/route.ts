import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

// Matches the TimescaleDB retention policy in migration 015.
const RETENTION_DAYS = 91

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [probeResult, publicJobsResult] = await Promise.all([
    sql<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM probe_results
        WHERE time < NOW() - (${RETENTION_DAYS} * INTERVAL '1 day')
        RETURNING 1
      )
      SELECT COUNT(*)::int AS deleted FROM deleted
    `,
    // CASCADE handles public_check_results cleanup automatically
    sql<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM public_check_jobs
        WHERE expires_at < NOW()
        RETURNING 1
      )
      SELECT COUNT(*)::int AS deleted FROM deleted
    `.catch(() => [{ deleted: 0 }]),
  ])

  return NextResponse.json({
    ok: true,
    deleted: probeResult[0]?.deleted ?? 0,
    publicJobsDeleted: publicJobsResult[0]?.deleted ?? 0,
    retentionDays: RETENTION_DAYS,
  })
}
