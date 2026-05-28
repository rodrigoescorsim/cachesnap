import sql from '@/lib/db'

/**
 * Sliding-window rate limiter backed by PostgreSQL.
 * Returns false if the caller has exceeded `max` attempts in `windowSeconds`.
 * Fails open on DB errors so a missing migration never breaks auth.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000)

    const [{ count }] = await sql<[{ count: number }]>`
      SELECT COUNT(*)::int AS count
      FROM rate_limit_attempts
      WHERE key = ${key} AND created_at > ${windowStart}
    `

    if (count >= max) return false

    await sql`INSERT INTO rate_limit_attempts (key) VALUES (${key})`

    // Fire-and-forget cleanup — don't block the request
    sql`DELETE FROM rate_limit_attempts WHERE created_at < NOW() - INTERVAL '1 day'`
      .catch(() => {})

    return true
  } catch (err) {
    console.error('[RATE LIMIT] DB error, failing open:', err)
    return true
  }
}

/**
 * Deletes the most recently inserted rate limit record for `key`.
 * Call this to refund a slot when a request was rejected server-side
 * (e.g. dispatch failure) so the user is not penalized for a service error.
 * Non-critical — failure is silently ignored.
 */
export async function refundRateLimit(key: string): Promise<void> {
  try {
    await sql`
      DELETE FROM rate_limit_attempts
      WHERE id = (
        SELECT id FROM rate_limit_attempts
        WHERE key = ${key}
        ORDER BY created_at DESC
        LIMIT 1
      )
    `
  } catch {
    // Non-critical
  }
}
