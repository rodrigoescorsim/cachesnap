import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Redirect logged-in users away from the landing page without a DB query.
  // Cookie presence is enough — if the session is expired, /monitors will
  // redirect to /login via getSession().
  if (request.cookies.get('session')?.value) {
    return NextResponse.redirect(new URL('/monitors', request.url))
  }
}

export const config = {
  matcher: ['/'],
}
