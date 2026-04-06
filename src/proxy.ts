import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionTokenFromCookie } from '@/lib/auth'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/dashboard')) return NextResponse.next()

  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/dashboard/:path*',
}
