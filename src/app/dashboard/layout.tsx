import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import sql from '@/lib/db'
import { MonitorNavDropdown } from './monitor-nav-dropdown'

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
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              CacheSnap
            </Link>
            <nav className="hidden sm:flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
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
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
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
