'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'
import { Resend } from 'resend'
import sql from '@/lib/db'
import { createSession, deleteSession } from '@/lib/auth'
import { MONITOR_AUDIT_INTERVAL_SECONDS, MONITOR_CHECK_INTERVAL_SECONDS } from '@/lib/monitor-schedule'

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

  const rawUrl = formData.get('url')?.toString().trim()
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      parsed.searchParams.delete('__CacheSnap_bypass')
      let normalizedUrl = parsed.toString()
      if (normalizedUrl.endsWith('/')) normalizedUrl = normalizedUrl.slice(0, -1)
      const name = normalizedUrl.replace(/^https?:\/\//, '')

      const [newMonitor] = await sql<{ id: string }[]>`
        INSERT INTO monitors (
          user_id, url, name, check_interval_seconds, audit_interval_seconds,
          audit_readiness_state, alert_threshold_ms, alert_threshold_hit_ms,
          alert_cache_hit_trend_threshold_pp, alert_ttfb_trend_threshold_pct,
          alert_ttfb_enabled, alert_down_enabled, alert_ttfb_anomaly_enabled,
          alert_anycast_enabled, alert_cache_age_enabled, alert_cache_hit_enabled,
          alert_cache_hit_trend_enabled, alert_ttfb_trend_enabled,
          alert_cache_hit_trend_comparators, alert_ttfb_trend_comparators,
          notify_email, notify_email_enabled
        )
        VALUES (
          ${user.id}, ${normalizedUrl}, ${name},
          ${MONITOR_CHECK_INTERVAL_SECONDS}, ${MONITOR_AUDIT_INTERVAL_SECONDS},
          'disabled', 1500, 500, 10, 50,
          true, true, true, false, false, false, true, true,
          ARRAY['prev_hour', 'day_avg'],
          ARRAY['prev_hour', 'day_avg'],
          ${email}, true
        )
        RETURNING id
      `

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      fetch(`${apiUrl}/api/monitors/${newMonitor.id}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-probe-secret': process.env.PROBE_SECRET ?? '',
        },
        body: JSON.stringify({ bypass: false, is_manual: false }),
      }).catch(() => {})
    } catch {
      // URL inválida — ignora, usuário vai criar o monitor manualmente
    }
  }

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

  // 5. Send reset email via Resend
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const resetLink = `${appUrl}/reset-password?token=${token}`
  const fromEmail = process.env.ALERT_FROM_EMAIL ?? 'CacheSnap <noreply@cachesnap.com>'
  const resendKey = process.env.RESEND_API_KEY

  if (resendKey) {
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Reset your CacheSnap password',
      html: buildPasswordResetEmail(resetLink, appUrl),
    }).catch((err) => {
      console.error('[PASSWORD RESET] Failed to send email:', err)
    })
  } else {
    console.warn('[PASSWORD RESET] RESEND_API_KEY not set — link:', resetLink)
  }

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

// ── Google OAuth Sandbox Action & Sync Helper ───────────────────────────────

export async function syncGoogleUser({
  email,
  providerAccountId,
}: {
  email: string
  providerAccountId: string
}): Promise<string> {
  // Check if account already exists
  const [existingAccount] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM accounts
    WHERE provider = 'google' AND provider_account_id = ${providerAccountId}
    LIMIT 1
  `

  if (existingAccount) {
    return existingAccount.user_id
  }

  // Check if a user with that email already exists
  const [existingUser] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${email} LIMIT 1
  `

  let userId = existingUser?.id

  if (!userId) {
    // Register new user (Google Auth)
    // Generate dummy password hash
    const dummyPassword = Math.random().toString(36) + Math.random().toString(36)
    const passwordHash = await bcrypt.hash(dummyPassword, 12)

    const [newUser] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id
    `
    userId = newUser.id
  }

  // Create the link account row
  await sql`
    INSERT INTO accounts (user_id, provider, provider_account_id)
    VALUES (${userId}, 'google', ${providerAccountId})
    ON CONFLICT (provider, provider_account_id) DO NOTHING
  `

  return userId
}

export async function loginGoogleSandbox(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const email = formData.get('email')?.toString().toLowerCase().trim()
  if (!email || !email.includes('@')) {
    return { errors: { email: ['Please enter a valid email address'] } }
  }

  const providerAccountId = `sandbox_google_${Buffer.from(email).toString('hex')}`

  try {
    const userId = await syncGoogleUser({ email, providerAccountId })
    await createSession(userId)
  } catch (error) {
    console.error('[SANDBOX GOOGLE LOGIN ERROR]', error)
    return { errors: { global: ['Failed to log in with simulated Google account'] } }
  }

  redirect('/monitors')
}

// ── Email Templates ────────────────────────────────────────────────────────────

function buildPasswordResetEmail(resetLink: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your CacheSnap password</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <a href="${appUrl}" style="text-decoration:none;">
                <span style="font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#22ff88;">Cache</span><span style="font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;">Snap</span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 36px;">

              <!-- Header -->
              <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">Reset your password</p>
              <p style="margin:0 0 28px;font-size:14px;color:#71717a;line-height:1.6;">
                We received a request to reset the password for your CacheSnap account. Click the button below to set a new password. This link expires in <strong style="color:#a1a1aa;">1 hour</strong>.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="${resetLink}"
                       style="display:inline-block;background:#22ff88;color:#09090b;font-size:14px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.01em;">
                      Reset password →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 24px;" />

              <!-- Fallback link -->
              <p style="margin:0 0 8px;font-size:12px;color:#52525b;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin:0;font-size:11px;word-break:break-all;">
                <a href="${resetLink}" style="color:#22ff88;text-decoration:none;">${resetLink}</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;" align="center">
              <p style="margin:0;font-size:11px;color:#3f3f46;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email.<br/>
                Your password won't change until you click the link above.
              </p>
              <p style="margin:12px 0 0;font-size:11px;color:#3f3f46;">
                <a href="${appUrl}" style="color:#52525b;text-decoration:none;">cachesnap.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
