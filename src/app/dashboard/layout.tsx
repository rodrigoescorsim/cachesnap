import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import { GlobalHeader } from '@/components/dashboard/global-header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <div className="min-h-full flex flex-col">
      <GlobalHeader userEmail={user.email} logoutAction={logout} />

      <main className="cs-container-adaptive flex-1 pt-[26px] pb-8">
        {children}
      </main>
    </div>
  )
}
