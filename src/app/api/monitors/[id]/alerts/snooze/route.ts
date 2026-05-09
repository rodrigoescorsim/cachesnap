import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

const patchSchema = z.object({
  alert_type: z.string().min(1),
  duration_hours: z.union([
    z.literal(1),
    z.literal(8),
    z.literal(24),
    z.literal(72),
    z.literal(168),
  ]),
})

const deleteSchema = z.object({
  alert_type: z.string().min(1),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params

  const [monitor] = await sql`
    SELECT id FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { alert_type, duration_hours } = parsed.data
  const snoozedUntil = new Date(Date.now() + duration_hours * 3600 * 1000)

  const [incident] = await sql`
    UPDATE alert_incidents
    SET snoozed_until = ${snoozedUntil}
    WHERE monitor_id = ${id}
      AND alert_type = ${alert_type}
      AND resolved_at IS NULL
    RETURNING id::text, snoozed_until
  `

  if (!incident) {
    return NextResponse.json({ error: 'No open incident for this alert type' }, { status: 404 })
  }

  return NextResponse.json({ id: incident.id, snoozed_until: incident.snoozed_until })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return unauthorized()

  const { id } = await params

  const [monitor] = await sql`
    SELECT id FROM monitors WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
  `
  if (!monitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { alert_type } = parsed.data

  const [incident] = await sql`
    UPDATE alert_incidents
    SET snoozed_until = NULL
    WHERE monitor_id = ${id}
      AND alert_type = ${alert_type}
      AND resolved_at IS NULL
    RETURNING id::text
  `

  if (!incident) {
    return NextResponse.json({ error: 'No open incident for this alert type' }, { status: 404 })
  }

  return NextResponse.json({ id: incident.id, snoozed_until: null })
}
