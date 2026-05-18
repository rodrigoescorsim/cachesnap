import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import sql from './db'

const COOKIE_NAME = 'session'
const SESSION_DURATION_DAYS = 30

export interface SessionUser {
  id: string
  email: string
  plan: string
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID()
  const expires = new Date()
  expires.setDate(expires.getDate() + SESSION_DURATION_DAYS)

  await sql`
    INSERT INTO sessions (session_token, user_id, expires)
    VALUES (${token}, ${userId}, ${expires})
  `

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  })

  return token
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const rows = await sql<{ id: string; email: string; plan: string }[]>`
    SELECT u.id, u.email, u.plan
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = ${token}
      AND s.expires > NOW()
    LIMIT 1
  `

  return rows[0] ?? null
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (token) {
    await sql`DELETE FROM sessions WHERE session_token = ${token}`
    cookieStore.delete(COOKIE_NAME)
  }
}

/** Lightweight session check for proxy.ts (reads cookie from request directly). */
export function getSessionTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return rest.join('=')
  }
  return null
}
