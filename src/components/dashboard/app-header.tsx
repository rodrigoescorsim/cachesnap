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
  const overviewActive = pathname === '/dashboard'
  const monitorsRouteActive = pathname === '/monitors' || pathname.startsWith('/dashboard/monitors')

  return (
    <header className="sticky top-0 z-50 border-b border-[#1e2937] bg-[#020617]/96 shadow-[0_1px_0_0_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-[#020617]/92">
      <div className="mx-auto flex h-[52px] max-w-6xl items-center justify-between gap-8 px-5 sm:px-8 lg:px-12">
        <div className="flex min-w-0 min-h-0 flex-1 items-center gap-8 md:gap-10 lg:gap-12">
          <Link
            href="/monitors"
            className="group relative inline-flex shrink-0 items-center outline-none transition-transform duration-200 ease-out hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-cyan-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
            aria-label="CacheSnap home"
          >
            <span
              className="pointer-events-none absolute -inset-2.5 rounded-2xl opacity-0 blur-lg transition-opacity duration-200 ease-out group-hover:opacity-100"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.12) 0%, transparent 72%)',
              }}
            />
            <Logo variant="header" className="relative z-10 h-8 w-auto sm:h-[2.2rem]" />
          </Link>

          <nav
            className="hidden min-w-0 items-center gap-6 md:gap-8 sm:flex"
            aria-label="Main"
          >
            <Link
              href="/dashboard"
              className={`relative inline-block px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 ease-out ${
                overviewActive
                  ? 'text-zinc-50'
                  : 'text-zinc-500 hover:text-cyan-200/85'
              } after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:rounded-full after:transition-opacity after:duration-200 after:ease-out ${
                overviewActive
                  ? 'after:bg-gradient-to-r after:from-cyan-400/70 after:via-teal-400/50 after:to-cyan-500/55 after:opacity-100'
                  : 'after:bg-cyan-400/40 after:opacity-0 hover:after:opacity-100'
              }`}
            >
              Overview
            </Link>

            <Link
              href="/monitors"
              className={`relative inline-block px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 ease-out ${
                monitorsRouteActive
                  ? 'text-zinc-50'
                  : 'text-zinc-500 hover:text-cyan-200/85'
              } after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:rounded-full after:transition-opacity after:duration-200 after:ease-out ${
                monitorsRouteActive
                  ? 'after:bg-gradient-to-r after:from-cyan-400/70 after:via-teal-400/50 after:to-cyan-500/55 after:opacity-100'
                  : 'after:bg-cyan-400/40 after:opacity-0 hover:after:opacity-100'
              }`}
            >
              Monitors
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
