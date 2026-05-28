import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { checkRateLimit, refundRateLimit } from '@/lib/rate-limit'
import { validatePublicCheckUrl } from '@/lib/public-check-url-validator'
import sql from '@/lib/db'

// Single source of truth — must stay in sync with the client-side countdown
const COOLDOWN_SECONDS = 180  // 3 minutes

function formatCooldownMessage(seconds: number): string {
  const mins = Math.round(seconds / 60)
  return mins <= 1
    ? `Please wait ${seconds} seconds before running another check.`
    : `Please wait ${mins} minutes before running another check.`
}

function getClientIp(request: NextRequest): string {
  // CF-Connecting-IP is set by Cloudflare and cannot be spoofed by clients.
  // Falls back to x-forwarded-for (first hop) or x-real-ip for non-CF envs.
  return (
    request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
  )
}

// GET /api/public/check — returns remaining cooldown for the caller's IP.
// Called by the form on mount so the countdown is consistent across browsers.
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const windowStart = new Date(Date.now() - COOLDOWN_SECONDS * 1000)

  const [row] = await sql<{ latest_at: Date | null }[]>`
    SELECT MAX(created_at) AS latest_at
    FROM rate_limit_attempts
    WHERE key = ${'public_check:cooldown:' + ip}
      AND created_at > ${windowStart}
  `.catch(() => [{ latest_at: null }])

  if (!row?.latest_at) {
    return NextResponse.json({ cooldownRemainingSeconds: 0 })
  }

  const expiresAt = new Date(row.latest_at.getTime() + COOLDOWN_SECONDS * 1000)
  const remaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))

  return NextResponse.json({
    cooldownRemainingSeconds: remaining,
    cooldownExpiresAt: remaining > 0 ? expiresAt.toISOString() : null,
  })
}

export async function POST(request: NextRequest) {
  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  const validation = validatePublicCheckUrl(rawUrl)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error, code: validation.code }, { status: 400 })
  }
  const normalizedUrl = validation.url

  const ip = getClientIp(request)

  // ── Rate limit keys (stored to allow refund on server-side failures) ────────
  const cooldownKey = `public_check:cooldown:${ip}`
  const hourlyKey = `public_check:hourly:${ip}`
  const urlHash = createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 16)
  const urlDedupKey = `public_check:url:${ip}:${urlHash}`

  // Layer 1: cooldown per IP
  const cooldownOk = await checkRateLimit(cooldownKey, 1, COOLDOWN_SECONDS)
  if (!cooldownOk) {
    return NextResponse.json(
      {
        error: formatCooldownMessage(COOLDOWN_SECONDS),
        retryAfterSeconds: COOLDOWN_SECONDS,
        type: 'cooldown',
      },
      { status: 429 }
    )
  }

  // Layer 2: 10 checks per IP per hour
  const hourlyOk = await checkRateLimit(hourlyKey, 10, 3600)
  if (!hourlyOk) {
    return NextResponse.json(
      { error: 'Hourly check limit reached. Try again in an hour.', retryAfterSeconds: 3600, type: 'hourly' },
      { status: 429 }
    )
  }

  // Layer 3: 3 checks for the same URL per IP per 15 min
  const urlDedupOk = await checkRateLimit(urlDedupKey, 3, 900)
  if (!urlDedupOk) {
    return NextResponse.json(
      { error: 'Too many checks for this URL. Try again in 15 minutes.', retryAfterSeconds: 900, type: 'url_dedup' },
      { status: 429 }
    )
  }

  // Global overload guard
  const [{ running }] = await sql<[{ running: number }]>`
    SELECT COUNT(*)::int AS running
    FROM public_check_jobs
    WHERE status = 'running'
  `
  if (running > 200) {
    // Refund slots — overload is server-side, not the user's fault
    await Promise.all([
      refundRateLimit(cooldownKey),
      refundRateLimit(hourlyKey),
      refundRateLimit(urlDedupKey),
    ])
    return NextResponse.json(
      { error: 'Service temporarily at capacity. Try again shortly.', code: 'OVERLOADED' },
      { status: 503 }
    )
  }

  const [job] = await sql<[{ id: string }]>`
    INSERT INTO public_check_jobs (url, ip, status)
    VALUES (${normalizedUrl}, ${ip}, 'running')
    RETURNING id
  `

  const rustApiUrl = process.env.RUST_API_URL || 'http://127.0.0.1:3001'
  const probeSecret = process.env.PROBE_SECRET || ''

  try {
    const dispatchRes = await fetch(`${rustApiUrl}/api/public/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-probe-secret': probeSecret,
      },
      body: JSON.stringify({ job_id: job.id, url: normalizedUrl }),
    })

    if (!dispatchRes.ok) {
      console.error('[PUBLIC CHECK] Dispatch returned', dispatchRes.status)
      await Promise.all([
        sql`UPDATE public_check_jobs SET status = 'error' WHERE id = ${job.id}`.catch(() => {}),
        refundRateLimit(cooldownKey),
        refundRateLimit(hourlyKey),
        refundRateLimit(urlDedupKey),
      ])
      return NextResponse.json({ error: 'Check service unavailable. Try again in a moment.', code: 'DISPATCH_FAILED' }, { status: 503 })
    }
  } catch (err) {
    console.error('[PUBLIC CHECK] Dispatch error:', err)
    await Promise.all([
      sql`UPDATE public_check_jobs SET status = 'error' WHERE id = ${job.id}`.catch(() => {}),
      refundRateLimit(cooldownKey),
      refundRateLimit(hourlyKey),
      refundRateLimit(urlDedupKey),
    ])
    return NextResponse.json({ error: 'Check service unavailable. Try again in a moment.', code: 'DISPATCH_FAILED' }, { status: 503 })
  }

  const cooldownExpiresAt = new Date(Date.now() + COOLDOWN_SECONDS * 1000).toISOString()
  return NextResponse.json({ jobId: job.id, cooldownExpiresAt })
}
