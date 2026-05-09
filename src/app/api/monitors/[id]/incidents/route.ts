import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params

  const [monitor] = await sql`
    SELECT id FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const incidents = await sql`
    SELECT
      id::text,
      alert_type,
      severity,
      affected_regions,
      opened_at,
      last_notified_at,
      notification_count,
      snoozed_until,
      last_actual,
      last_threshold,
      EXTRACT(EPOCH FROM (NOW() - opened_at))::float * 1000 AS duration_ms
    FROM alert_incidents
    WHERE monitor_id = ${id} AND resolved_at IS NULL
    ORDER BY opened_at DESC
  `

  return NextResponse.json({ incidents })
}
