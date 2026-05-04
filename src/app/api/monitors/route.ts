import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

const createSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  name: z.string().max(100).optional(),
  check_interval_seconds: z.number().int().min(1).default(60),
  audit_interval_seconds: z.number().int().min(0).default(0),
})

function normalizeMonitorUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  parsed.searchParams.delete('__CacheSnap_bypass')
  let normalized = parsed.toString()

  // Remover barra final para normalização (ex: site.com/ e site.com serem iguais)
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()

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
  if (!user) return unauthorized()

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

  // Se o nome não for fornecido, geramos um automaticamente a partir da URL (excluindo o protocolo)
  const finalName = name || normalizedUrl.replace(/^https?:\/\//, '')

  // Prevenir duplicatas para o mesmo usuário
  const existing = await sql`
    SELECT id FROM monitors 
    WHERE user_id = ${user.id} AND url = ${normalizedUrl}
    LIMIT 1
  `
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'You already have a monitor configured for this URL.' },
      { status: 409 }
    )
  }

  const [monitor] = await sql`
    INSERT INTO monitors (user_id, url, name, check_interval_seconds, audit_interval_seconds, audit_readiness_state)
    VALUES (${user.id}, ${normalizedUrl}, ${finalName}, ${check_interval_seconds}, ${audit_interval_seconds}, 'disabled')
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
    body: JSON.stringify({ bypass: false }),
  }).catch(() => {}) // fire-and-forget

  return NextResponse.json(monitor, { status: 201 })
}
