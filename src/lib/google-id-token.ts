export type GoogleIdTokenPayload = {
  sub: string
  email?: string
  email_verified?: string | boolean
  aud?: string
  iss?: string
  exp?: string
}

/** Validates a Google Identity Services ID token (One Tap / Sign in with Google button). */
export async function verifyGoogleIdToken(
  credential: string,
  expectedClientId: string,
): Promise<{ email: string; providerAccountId: string } | null> {
  const tokenResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  )

  if (!tokenResponse.ok) {
    return null
  }

  const payload = (await tokenResponse.json()) as GoogleIdTokenPayload & { error?: string }
  if (payload.error) {
    return null
  }

  const iss = payload.iss
  const validIssuer =
    iss === 'accounts.google.com' || iss === 'https://accounts.google.com'
  if (!validIssuer || payload.aud !== expectedClientId) {
    return null
  }

  const emailVerified =
    payload.email_verified === true || payload.email_verified === 'true'
  if (!emailVerified || !payload.email || !payload.sub) {
    return null
  }

  const exp = Number(payload.exp)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return null
  }

  return {
    email: payload.email.toLowerCase(),
    providerAccountId: payload.sub,
  }
}
