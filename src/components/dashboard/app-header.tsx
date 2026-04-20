'use client'

/**
 * Altura: `h-[52px]` no div interior (único controlo de altura da barra).
 * Espaçamento: padding-x simétrico + gaps explícitos logo↔nav↔utilizador para ritmo equilibrado.
 * User actions: `UserDropdown` no canto direito.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/logo'
import { UserDropdown } from '@/components/dashboard/UserDropdown'

type AppHeaderProps = {
  userEmail: string
  logoutAction: () => Promise<void>
}

export function AppHeader({ userEmail, logoutAction }: AppHeaderProps) {
  const pathname = usePathname()
  const monitorsRouteActive = pathname === '/monitors' || pathname.startsWith('/dashboard/monitors')
  const insightsActive = pathname === '/insights' || pathname.startsWith('/insights')

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/96 shadow-[0_1px_0_0_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92">
      <div className="mx-auto flex h-[52px] max-w-6xl items-center justify-between gap-8 px-5 sm:px-8 lg:px-12">
        <div className="flex min-w-0 min-h-0 flex-1 items-center gap-8 md:gap-10 lg:gap-12">
          <Link
            href="/monitors"
            className="group relative inline-flex shrink-0 items-center outline-none transition-transform duration-200 ease-out hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[rgba(34,255,136,0.3)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="CacheSnap home"
          >
            <span
              className="pointer-events-none absolute -inset-2.5 rounded-2xl opacity-0 blur-lg transition-opacity duration-200 ease-out group-hover:opacity-100"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(34,255,136,0.1) 0%, transparent 72%)',
              }}
            />
            <Logo variant="header" className="relative z-10 h-8 w-auto sm:h-[2.2rem]" />
          </Link>

          <nav
            className="hidden min-w-0 items-center gap-6 md:gap-8 sm:flex"
            aria-label="Main"
          >
            <Link
              href="/monitors"
              className={`relative inline-block px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 ease-out ${
                monitorsRouteActive ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span
                className={`absolute bottom-0 left-0 right-0 h-px rounded-full transition-opacity duration-200 ${monitorsRouteActive ? 'opacity-100' : 'opacity-0'}`}
                style={{ background: 'var(--brand-primary)' }}
                aria-hidden
              />
              Monitors
            </Link>

            <Link
              href="/insights"
              className={`relative inline-block px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 ease-out ${
                insightsActive ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span
                className={`absolute bottom-0 left-0 right-0 h-px rounded-full transition-opacity duration-200 ${insightsActive ? 'opacity-100' : 'opacity-0'}`}
                style={{ background: 'var(--brand-primary)' }}
                aria-hidden
              />
              Insights
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center pl-1 md:pl-2">
          <UserDropdown email={userEmail} logoutAction={logoutAction} />
        </div>
      </div>
    </header>
  )
}
