'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import sql from '@/lib/db'
import { getSession } from '@/lib/auth'

type ActionResult = { errors?: Record<string, string[]>; success?: boolean }

// ── Change Password ───────────────────────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmNewPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmNewPassword, {
  message: "Passwords don't match",
  path: ['confirmNewPassword'],
})

export async function changePassword(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await getSession()
  if (!user) redirect('/login')

  const [oauthRow] = await sql`
    SELECT id FROM accounts WHERE user_id = ${user.id} AND provider = 'google' LIMIT 1
  `
  if (oauthRow) {
    return { errors: { global: ['Password management is unavailable for Google accounts'] } }
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmNewPassword: formData.get('confirmNewPassword'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { currentPassword, newPassword } = parsed.data

  const [row] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM users WHERE id = ${user.id} LIMIT 1
  `
  const passwordMatch = await bcrypt.compare(currentPassword, row?.password_hash ?? '')
  if (!passwordMatch) {
    return { errors: { currentPassword: ['Incorrect password'] } }
  }

  if (currentPassword === newPassword) {
    return { errors: { newPassword: ['New password must be different from the current one'] } }
  }

  const newHash = await bcrypt.hash(newPassword, 12)
  await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`

  // Invalidate all other sessions — keep the current one active
  const cookieStore = await cookies()
  const currentToken = cookieStore.get('session')?.value
  if (currentToken) {
    await sql`
      DELETE FROM sessions
      WHERE user_id = ${user.id} AND session_token != ${currentToken}
    `
  } else {
    await sql`DELETE FROM sessions WHERE user_id = ${user.id}`
  }

  return { success: true }
}

// ── Delete Account ────────────────────────────────────────────────────────────

export async function deleteAccount(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await getSession()
  if (!user) redirect('/login')

  const [oauthRow] = await sql`
    SELECT id FROM accounts WHERE user_id = ${user.id} AND provider = 'google' LIMIT 1
  `
  const isOAuthUser = !!oauthRow

  const confirmation = formData.get('confirmation')?.toString().trim() ?? ''

  if (isOAuthUser) {
    if (confirmation.toLowerCase() !== user.email.toLowerCase()) {
      return { errors: { confirmation: ['Email does not match your account email'] } }
    }
  } else {
    const [row] = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${user.id} LIMIT 1
    `
    const passwordMatch = await bcrypt.compare(confirmation, row?.password_hash ?? '')
    if (!passwordMatch) {
      return { errors: { confirmation: ['Incorrect password'] } }
    }
  }

  // CASCADE deletes: sessions, monitors, accounts, alert_incidents, probes, etc.
  await sql`DELETE FROM users WHERE id = ${user.id}`

  const cookieStore = await cookies()
  cookieStore.delete('session')

  redirect('/')
}
