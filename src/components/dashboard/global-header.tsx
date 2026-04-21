'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/logo'
import { UserDropdown } from '@/components/dashboard/UserDropdown'

type GlobalHeaderProps = {
  userEmail: string
  logoutAction: () => Promise<void>
}

const NAV_ITEMS = [
  {
    label: 'Monitors',
    href: '/monitors',
    disabled: false,
    match: (p: string) => p === '/monitors' || p.startsWith('/monitors/') || p.startsWith('/dashboard/monitors'),
  },
  {
    label: 'Insights',
    href: '/insights',
    disabled: false,
    match: (p: string) => p === '/insights' || p.startsWith('/insights/'),
  },
  { label: 'Diagnostics', href: '', disabled: true, match: () => false },
  { label: 'Alerts',      href: '', disabled: true, match: () => false },
  { label: 'Settings',    href: '', disabled: true, match: () => false },
]

export function GlobalHeader({ userEmail, logoutAction }: GlobalHeaderProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const showCreateMonitor = pathname === '/monitors'

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/96 shadow-[0_1px_0_0_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-12">

        {/* Left: Logo + Desktop Nav */}
        <div className="flex items-center gap-9">
          <Link
            href="/monitors"
            aria-label="CacheSnap home"
            className="group relative inline-flex shrink-0 items-center outline-none transition-transform duration-200 ease-out hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[rgba(34,255,136,0.3)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className="pointer-events-none absolute -inset-2.5 rounded-2xl opacity-0 blur-lg transition-opacity duration-200 ease-out group-hover:opacity-100"
              style={{ background: 'radial-gradient(ellipse at center, rgba(34,255,136,0.1) 0%, transparent 72%)' }}
            />
            <Logo variant="header" className="relative z-10 h-8 w-auto sm:h-[2.2rem]" />
          </Link>

          <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
            {NAV_ITEMS.map(item => {
              const isActive = item.match(pathname)
              if (item.disabled) {
                return (
                  <span
                    key={item.label}
                    aria-disabled="true"
                    className="cursor-not-allowed px-1 py-1 text-[14px] font-medium tracking-tight text-zinc-700"
                  >
                    {item.label}
                  </span>
                )
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative inline-block px-1 py-1 text-[14px] font-medium tracking-tight transition-colors duration-200 ease-out ${
                    isActive ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <span
                    className={`absolute bottom-0 left-0 right-0 h-px rounded-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                    style={{ background: '#22FF88' }}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right: Create Monitor + User + Mobile toggle */}
        <div className="flex items-center gap-3">
          {showCreateMonitor && (
            <Link
              href="/monitors/new"
              className="cs-btn-primary hidden h-9 gap-2 px-4 text-[13px] font-bold md:inline-flex"
              aria-label="Create a new monitor"
            >
              <span>+ Create Monitor</span>
            </Link>
          )}
          <UserDropdown email={userEmail} logoutAction={logoutAction} />
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(34,255,136,0.3)] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="border-t border-border bg-background/98 md:hidden">
          <nav
            className="mx-auto max-w-6xl px-5 py-3 sm:px-8"
            aria-label="Mobile navigation"
          >
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map(item => {
                const isActive = item.match(pathname)
                if (item.disabled) {
                  return (
                    <li key={item.label}>
                      <span className="flex cursor-not-allowed items-center px-3 py-2.5 text-[14px] font-medium text-zinc-700">
                        {item.label}
                      </span>
                    </li>
                  )
                }
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-white/[0.04] text-[#F8FAFC]'
                          : 'text-[#94A3B8] hover:bg-white/[0.03] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {isActive && (
                        <span className="mr-2.5 h-1.5 w-1.5 rounded-full" style={{ background: '#22FF88' }} aria-hidden />
                      )}
                      {item.label}
                    </Link>
                  </li>
                )
              })}
              {showCreateMonitor && (
                <li className="pt-2">
                  <Link
                    href="/monitors/new"
                    onClick={() => setMobileOpen(false)}
                    className="cs-btn-primary flex h-9 w-full items-center justify-center gap-2 px-4 text-[13px] font-bold"
                  >
                    <span>+ Create Monitor</span>
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  )
}
