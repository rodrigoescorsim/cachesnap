import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import sql from '@/lib/db'
import { AppHeader } from '@/components/dashboard/app-header'

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
      <AppHeader monitors={monitors} userEmail={user.email} logoutAction={logout} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-12 pt-[26px] pb-8">
        {children}
      </main>
    </div>
  )
}
