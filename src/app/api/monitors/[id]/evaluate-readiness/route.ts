import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { unauthorized } from '@/lib/api-auth'
import sql from '@/lib/db'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params

  // Verificar propriedade do monitor
  const [monitor] = await sql`
    SELECT id FROM monitors WHERE id = ${id} AND user_id = ${session.id}
  `
  if (!monitor) return NextResponse.json({ error: 'Monitor not found' }, { status: 404 })

  const rustApiUrl = process.env.RUST_API_URL || 'http://127.0.0.1:3001'
  const probeSecret = process.env.PROBE_SECRET

  try {
    const res = await fetch(`${rustApiUrl}/api/monitors/${id}/evaluate-readiness`, {
      method: 'POST',
      headers: { 'x-probe-secret': probeSecret || '' },
    })

    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return NextResponse.json({ error: body.error || 'Failed to evaluate' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, state: data.state })
  } catch (err) {
    console.error('Evaluate readiness error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
