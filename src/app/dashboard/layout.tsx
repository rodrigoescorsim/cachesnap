import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { logout } from '@/app/actions/auth'
import { GlobalHeader } from '@/components/dashboard/global-header'
import { EmailVerificationBanner } from '@/components/dashboard/email-verification-banner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <div className="min-h-full flex flex-col">
      <GlobalHeader userEmail={user.email} logoutAction={logout} />
      {!user.emailVerified && <EmailVerificationBanner userEmail={user.email} />}

      <main className="cs-container-adaptive flex-1 pt-[26px] pb-8">
        {children}
      </main>
    </div>
  )
}
