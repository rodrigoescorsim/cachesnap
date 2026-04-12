import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'

const updateSchema = z.object({
  name: z.string().max(100).optional(),
  check_interval_seconds: z.number().int().min(1).optional(),
  audit_interval_seconds: z.number().int().min(1).optional(),
  is_active: z.boolean().optional(),
  notify_email: z.string().email().max(254).nullable().optional(),
  notify_email_enabled: z.boolean().optional(),
  notify_slack_webhook: z.string().url().max(500).nullable().optional(),
  notify_slack_enabled: z.boolean().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [monitor] = await sql`
    SELECT id, url, name, check_interval_seconds, audit_interval_seconds, is_active,
           notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
           created_at
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

  const {
    name, check_interval_seconds, audit_interval_seconds, is_active,
    notify_email, notify_email_enabled,
    notify_slack_webhook, notify_slack_enabled,
  } = parsed.data

  if (
    name === undefined && check_interval_seconds === undefined && audit_interval_seconds === undefined && 
    is_active === undefined && notify_email === undefined && notify_email_enabled === undefined &&
    notify_slack_webhook === undefined && notify_slack_enabled === undefined
  ) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [monitor] = await sql`
    UPDATE monitors
    SET
      name                   = COALESCE(${name ?? null}, name),
      check_interval_seconds = COALESCE(${check_interval_seconds ?? null}, check_interval_seconds),
      audit_interval_seconds = COALESCE(${audit_interval_seconds ?? null}, audit_interval_seconds),
      is_active              = COALESCE(${is_active ?? null}, is_active),
      notify_email           = CASE WHEN ${notify_email !== undefined} THEN ${notify_email ?? null} ELSE notify_email END,
      notify_email_enabled   = COALESCE(${notify_email_enabled ?? null}, notify_email_enabled),
      notify_slack_webhook   = CASE WHEN ${notify_slack_webhook !== undefined} THEN ${notify_slack_webhook ?? null} ELSE notify_slack_webhook END,
      notify_slack_enabled   = COALESCE(${notify_slack_enabled ?? null}, notify_slack_enabled)
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id, url, name, check_interval_seconds, audit_interval_seconds, is_active,
              notify_email, notify_email_enabled, notify_slack_webhook, notify_slack_enabled,
              created_at
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
