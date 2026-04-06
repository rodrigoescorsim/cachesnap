'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
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
  redirect('/dashboard')
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
  redirect('/dashboard')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}
