'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/logo'

type MarketingNav = 'home' | 'pricing'

type MarketingHeaderProps = {
  activeNav?: MarketingNav
}

const NAV_LINK_CLASS =
  'text-[11px] font-semibold uppercase tracking-widest text-zinc-400 transition-colors hover:text-white'

function navLinkClass(isActive: boolean) {
  return isActive ? `${NAV_LINK_CLASS} text-white` : NAV_LINK_CLASS
}

export function MarketingHeader({ activeNav }: MarketingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
    <header
      className={`cs-marketing-header transition-[border-color,box-shadow] duration-200 ${
        scrolled ? 'border-white/[0.08] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]' : ''
      }`}
    >
      <div className="cs-container-adaptive relative flex h-16 items-center justify-between gap-4">
        <Link href="/" className="relative z-10 shrink-0 transition-opacity hover:opacity-80" onClick={closeMenu}>
          <Logo className="h-10 sm:h-11" />
        </Link>

        <nav
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex"
          aria-label="Main"
        >
          <Link href="/#how-it-works" className={navLinkClass(false)}>
            How it works
          </Link>
          <Link href="/#dashboard" className={navLinkClass(false)}>
            Dashboard
          </Link>
          <Link href="/pricing" className={navLinkClass(activeNav === 'pricing')}>
            Pricing
          </Link>
        </nav>

        <div className="relative z-10 flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-lg border border-white/10 px-4 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signup" className="cs-btn-primary hidden h-9 items-center rounded-lg px-4 text-sm font-semibold sm:inline-flex">
            Start free
          </Link>

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:border-white/20 hover:text-white md:hidden"
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="marketing-mobile-menu"
          className="border-t border-white/[0.06] bg-background/98 backdrop-blur-md md:hidden"
        >
          <nav className="cs-container-adaptive flex flex-col gap-1 py-4" aria-label="Main mobile">
            <Link
              href="/#how-it-works"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              onClick={closeMenu}
            >
              How it works
            </Link>
            <Link
              href="/#dashboard"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              onClick={closeMenu}
            >
              Dashboard
            </Link>
            <Link
              href="/pricing"
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.04] hover:text-white ${
                activeNav === 'pricing' ? 'text-white' : 'text-zinc-300'
              }`}
              onClick={closeMenu}
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              onClick={closeMenu}
            >
              Sign in
            </Link>
            <div className="mt-2 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
              <Link
                href="/signup"
                className="cs-btn-primary inline-flex h-10 items-center justify-center rounded-lg text-sm font-semibold"
                onClick={closeMenu}
              >
                Start free
              </Link>
              <p className="text-center text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                No credit card
              </p>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
    {/* Reserva altura do header fixo (h-16) */}
    <div className="h-16 shrink-0" aria-hidden />
    </>
  )
}

export function MarketingFooter() {
  return (
    <footer className="cs-marketing-footer">
      <div className="cs-container-adaptive py-10">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <Logo className="h-8 opacity-70" />
            <span className="hidden text-zinc-700 sm:inline">·</span>
            <span className="text-xs text-zinc-500">Edge Performance Monitoring</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-500">
            <Link href="/login" className="transition-colors hover:text-zinc-300">
              Sign in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-zinc-300">
              Sign up free
            </Link>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-600">© 2026 CacheSnap</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
