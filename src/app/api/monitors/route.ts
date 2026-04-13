import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'

const createSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  name: z.string().max(100).optional(),
  check_interval_seconds: z.number().int().min(1).default(60),
  audit_interval_seconds: z.number().int().min(1).default(3600),
})

function normalizeMonitorUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  parsed.searchParams.delete('__CacheSnap_bypass')
  return parsed.toString()
}

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const monitors = await sql`
    SELECT id, url, name, check_interval_seconds, audit_interval_seconds, is_active, created_at
    FROM monitors
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `

  return NextResponse.json(monitors)
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { url, name, check_interval_seconds, audit_interval_seconds } = parsed.data
  const normalizedUrl = normalizeMonitorUrl(url)

  const [monitor] = await sql`
    INSERT INTO monitors (user_id, url, name, check_interval_seconds, audit_interval_seconds)
    VALUES (${user.id}, ${normalizedUrl}, ${name ?? null}, ${check_interval_seconds}, ${audit_interval_seconds})
    RETURNING id, url, name, check_interval_seconds, audit_interval_seconds, is_active, created_at
  `

  // Disparar probes imediatamente em background — não bloqueia a response
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  fetch(`${apiUrl}/api/monitors/${monitor.id}/dispatch`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-probe-secret': process.env.PROBE_SECRET ?? '' 
    },
    body: JSON.stringify({}),
  }).catch(() => {}) // fire-and-forget

  return NextResponse.json(monitor, { status: 201 })
}
