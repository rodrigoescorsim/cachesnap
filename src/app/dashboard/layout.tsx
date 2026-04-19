import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import { AppHeader } from '@/components/dashboard/app-header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <div className="min-h-full flex flex-col">
      <AppHeader userEmail={user.email} logoutAction={logout} />

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-12 pt-[26px] pb-8">
        {children}
      </main>
    </div>
  )
}
