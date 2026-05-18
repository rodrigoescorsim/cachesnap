import Link from 'next/link'
import { Logo } from '@/components/logo'

type MarketingNav = 'home' | 'pricing'

type MarketingHeaderProps = {
  activeNav?: MarketingNav
}

export function MarketingHeader({ activeNav }: MarketingHeaderProps) {
  return (
    <header className="cs-marketing-header">
      <div className="cs-container-adaptive flex h-14 items-center justify-between">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo className="h-11" />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className={`text-sm font-medium transition-colors ${
              activeNav === 'pricing' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Pricing
          </Link>
          <Link href="/login" className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
            Sign in
          </Link>
          <Link href="/signup" className="cs-btn-primary rounded-lg px-4 py-1.5 text-sm">
            Get started free
          </Link>
        </div>
      </div>
    </header>
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
