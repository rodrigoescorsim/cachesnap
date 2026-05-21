import { NextResponse } from 'next/server'
import { syncGoogleUser } from '@/app/actions/auth'
import { createSession } from '@/lib/auth'
import { verifyGoogleIdToken } from '@/lib/google-id-token'

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'google_not_configured' }, { status: 503 })
  }

  let body: { credential?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const credential = body.credential
  if (!credential || typeof credential !== 'string') {
    return NextResponse.json({ error: 'missing_credential' }, { status: 400 })
  }

  const profile = await verifyGoogleIdToken(credential, clientId)
  if (!profile) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  try {
    const userId = await syncGoogleUser(profile)
    await createSession(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[GOOGLE ONE TAP]', error)
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 })
  }
}
