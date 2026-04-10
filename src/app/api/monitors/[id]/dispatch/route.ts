import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // 1. Verificar se o monitor pertence ao usuário
  const [monitor] = await sql`
    SELECT id FROM monitors WHERE id = ${id} AND user_id = ${session.id}
  `
  if (!monitor) return NextResponse.json({ error: 'Monitor not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const bypass = body.bypass === true

  // 2. Chamar a API Rust para o dispatch real
  const rustApiUrl = 'http://127.0.0.1:3001'
  const probeSecret = process.env.PROBE_SECRET
  
  try {
    const res = await fetch(`${rustApiUrl}/api/monitors/${id}/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-probe-secret': probeSecret || '',
      },
      body: JSON.stringify({ bypass })
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return NextResponse.json({ error: error.error || 'Failed to dispatch' }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Dispatch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
