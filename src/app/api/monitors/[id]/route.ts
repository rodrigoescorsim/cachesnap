import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'

const updateSchema = z.object({
  name: z.string().max(100).optional(),
  alert_threshold_ms: z.number().int().min(100).max(30000).optional(),
  is_active: z.boolean().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [monitor] = await sql`
    SELECT id, url, name, check_interval_seconds, alert_threshold_ms, is_active, created_at
    FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `

  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(monitor)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { name, alert_threshold_ms, is_active } = parsed.data
  if (name === undefined && alert_threshold_ms === undefined && is_active === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [monitor] = await sql`
    UPDATE monitors
    SET
      name               = COALESCE(${name ?? null}, name),
      alert_threshold_ms = COALESCE(${alert_threshold_ms ?? null}, alert_threshold_ms),
      is_active          = COALESCE(${is_active ?? null}, is_active)
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id, url, name, check_interval_seconds, alert_threshold_ms, is_active, created_at
  `

  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(monitor)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await sql`
    DELETE FROM monitors WHERE id = ${id} AND user_id = ${user.id} RETURNING id
  `

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
