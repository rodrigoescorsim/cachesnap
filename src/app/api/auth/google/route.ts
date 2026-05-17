import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  if (clientId) {
    // Real Google OAuth flow
    const redirectUri = `${appUrl}/api/auth/google/callback`
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `response_type=code` +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline` +
      `&prompt=consent`

    return NextResponse.redirect(googleAuthUrl)
  }

  // Sandbox Mode: Redirect to interactive simulated login
  return NextResponse.redirect(`${appUrl}/auth/google-sandbox`)
}
