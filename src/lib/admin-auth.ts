import { cookies, headers } from 'next/headers'
import sql from './db'

export interface AdminUser {
  id: string
  email: string
}

const COOKIE_NAME = 'session'

export async function getAdminSession(): Promise<AdminUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const rows = await sql<AdminUser[]>`
    SELECT u.id, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = ${token}
      AND s.expires > NOW()
      AND u.is_admin_internal = true
    LIMIT 1
  `

  return rows[0] ?? null
}

export async function logAdminAccess(userId: string, endpoint: string): Promise<void> {
  try {
    const headersList = await headers()
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? headersList.get('x-real-ip')
      ?? 'unknown'

    await sql`
      INSERT INTO admin_access_log (user_id, endpoint, ip)
      VALUES (${userId}, ${endpoint}, ${ip})
    `
  } catch {
    // Non-critical — never fail the request for logging
  }
}
