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
              <p className="text-center text-[10px] font-medium uppercase tracking-widest text-zinc-400">
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

const FOOTER_LINK_CLASS = 'text-sm text-zinc-400 transition-colors hover:text-white'

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{title}</p>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className={FOOTER_LINK_CLASS}>
        {children}
      </Link>
    </li>
  )
}

export function MarketingFooter() {
  return (
    <footer className="cs-marketing-footer">
      <div className="cs-container-adaptive pt-10 pb-8 md:pt-12 md:pb-9">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-8 lg:gap-12">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <Link href="/" className="w-fit transition-opacity hover:opacity-80">
              <Logo className="h-8 opacity-80" />
            </Link>
            <p className="max-w-[14rem] text-sm leading-relaxed text-zinc-400">
              Edge monitoring platform.
            </p>
          </div>

          <FooterColumn title="Product">
            <FooterLink href="/#how-it-works">How it works</FooterLink>
            <FooterLink href="/#dashboard">Dashboard</FooterLink>
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/signup">Start free</FooterLink>
          </FooterColumn>

          <FooterColumn title="Account">
            <FooterLink href="/login">Sign in</FooterLink>
            <FooterLink href="/signup">Sign up free</FooterLink>
          </FooterColumn>

          <FooterColumn title="Company">
            <li>
              <a href="mailto:hello@cachesnap.com" className={FOOTER_LINK_CLASS}>
                Contact
              </a>
            </li>
          </FooterColumn>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-6 md:flex-row md:gap-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
            © 2026 CacheSnap
          </p>
          <p className="text-center text-[11px] font-medium uppercase tracking-widest text-zinc-400 md:text-right">
            No SDK · No Agent · No DNS changes
          </p>
        </div>
      </div>
    </footer>
  )
}
