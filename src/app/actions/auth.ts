'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'
import sql from '@/lib/db'
import { createSession, deleteSession } from '@/lib/auth'

const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

type ActionResult = { errors?: Record<string, string[]> }

export async function signup(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { email: rawEmail, password } = parsed.data
  const email = rawEmail.toLowerCase()

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
  if (existing.length > 0) {
    return { errors: { email: ['Email already in use'] } }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash})
    RETURNING id
  `

  await createSession(user.id)
  redirect('/monitors')
}

export async function login(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { email: rawEmail, password } = parsed.data
  const email = rawEmail.toLowerCase()

  const [user] = await sql<{ id: string; password_hash: string }[]>`
    SELECT id, password_hash FROM users WHERE email = ${email} LIMIT 1
  `

  // Always run bcrypt.compare to prevent timing attacks that reveal registered emails.
  // If user doesn't exist, compare against a dummy hash (always fails).
  const DUMMY_HASH = '$2b$12$dummy.hash.that.never.matches.any.real.password.000000'
  const passwordMatch = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)

  if (!user || !passwordMatch) {
    return { errors: { email: ['Invalid email or password'] } }
  }

  await createSession(user.id)
  redirect('/monitors')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}

// ── Password Reset Schemas & Actions ──────────────────────────────────────────

const requestResetSchema = z.object({
  email: z.string().email('Invalid email'),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export async function requestPasswordReset(
  _prev: (ActionResult & { success?: boolean }) | undefined,
  formData: FormData
): Promise<ActionResult & { success?: boolean }> {
  const parsed = requestResetSchema.safeParse({
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { email: rawEmail } = parsed.data
  const email = rawEmail.toLowerCase()

  // 1. Find user in database
  const [user] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${email} LIMIT 1
  `

  // 2. Security: Return success even if email doesn't exist (no email enumeration)
  if (!user) {
    console.log(`[PASSWORD RESET] Simulated recovery request for email: ${email}`)
    return { success: true }
  }

  // 3. Generate token & expiration (1 hour)
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  // 4. Save token to DB
  await sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`
  await sql`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (${user.id}, ${token}, ${expiresAt})
  `

  // 5. Simulated Email Send
  const resetLink = `http://localhost:3000/reset-password?token=${token}`
  console.log(`\n======================================================`)
  console.log(`🔑 PASSWORD RESET LINK REQUESTED`)
  console.log(`For user: ${email}`)
  console.log(`Link: ${resetLink}`)
  console.log(`Expires at: ${expiresAt.toISOString()}`)
  console.log(`======================================================\n`)

  return { success: true }
}

export async function resetPassword(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const token = formData.get('token')?.toString()
  const password = formData.get('password')?.toString()
  const confirmPassword = formData.get('confirmPassword')?.toString()

  if (!token) {
    return { errors: { global: ['Invalid or missing recovery token'] } }
  }

  const parsed = resetPasswordSchema.safeParse({
    password,
    confirmPassword,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { password: newPassword } = parsed.data

  // 1. Verify token
  const [tokenRecord] = await sql<{ user_id: string; expires_at: Date }[]>`
    SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ${token} LIMIT 1
  `

  if (!tokenRecord) {
    return { errors: { global: ['The password reset link is invalid or has expired'] } }
  }

  if (new Date() > new Date(tokenRecord.expires_at)) {
    await sql`DELETE FROM password_reset_tokens WHERE token = ${token}`
    return { errors: { global: ['The password reset link has expired'] } }
  }

  // 2. Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12)

  // 3. Update password & clean up token
  await sql`
    UPDATE users SET password_hash = ${passwordHash} WHERE id = ${tokenRecord.user_id}
  `
  await sql`
    DELETE FROM password_reset_tokens WHERE token = ${token}
  `

  console.log(`[PASSWORD RESET] Successfully updated password for user_id: ${tokenRecord.user_id}`)

  redirect('/login?reset=success')
}
