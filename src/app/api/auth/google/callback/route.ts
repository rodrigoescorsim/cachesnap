import { NextRequest, NextResponse } from 'next/server'
import { syncGoogleUser } from '@/app/actions/auth'
import { createSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_code`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${appUrl}/api/auth/google/callback`

  try {
    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('[GOOGLE AUTH ERROR] Failed to exchange token:', errorData)
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`)
    }

    const { access_token } = await tokenResponse.json()

    // 2. Fetch Google User Profile
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!userResponse.ok) {
      return NextResponse.redirect(`${appUrl}/login?error=user_info_failed`)
    }

    const googleUser = await userResponse.json()
    const email = googleUser.email?.toLowerCase()
    const providerAccountId = googleUser.sub // Google's unique user ID

    if (!email || !providerAccountId) {
      return NextResponse.redirect(`${appUrl}/login?error=invalid_google_profile`)
    }

    // 3. Database Sync Transaction using the action sync helper
    const userId = await syncGoogleUser({ email, providerAccountId })

    // 4. Create local session
    await createSession(userId)

    return NextResponse.redirect(`${appUrl}/monitors`)
  } catch (error) {
    console.error('[GOOGLE CALLBACK EXCEPTION]', error)
    return NextResponse.redirect(`${appUrl}/login?error=internal_auth_error`)
  }
}
