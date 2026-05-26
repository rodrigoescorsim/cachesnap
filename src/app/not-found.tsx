import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/logo'

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <Link href="/" className="mb-10 hover:opacity-80 transition-opacity">
        <Logo className="h-14" />
      </Link>

      <p className="text-[11px] font-black uppercase tracking-widest text-[var(--brand-primary)] mb-3">
        404
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-3">
        Page not found
      </h1>
      <p className="text-sm text-zinc-500 max-w-xs mb-8">
        This page doesn't exist or was moved.
      </p>

      <Link
        href="/"
        className="cs-btn-primary h-10 px-6 text-sm inline-flex items-center"
      >
        Back to home
      </Link>
    </div>
  )
}
