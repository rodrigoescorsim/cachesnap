import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import sql from '@/lib/db'
import { MonitorNavDropdown } from './monitor-nav-dropdown'
import { Logo } from '@/components/logo'

interface NavMonitor {
  id: string
  url: string
  name: string | null
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession()
  if (!user) redirect('/login')
  const monitors = await sql<NavMonitor[]>`
    SELECT id, url, name
    FROM monitors
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 100
  `

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="transition-opacity hover:opacity-80">
              <Logo className="h-11" />
            </Link>
            <nav className="hidden sm:flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-sm text-zinc-500 hover:text-white transition-colors"
              >
                Overview
              </Link>
              <MonitorNavDropdown monitors={monitors} />
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-xs text-zinc-400">{user.email}</span>
            <form action={logout}>
              <button
                type="submit"
                className="text-xs font-medium text-zinc-500 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
