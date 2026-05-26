import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { InsightsView } from '@/components/insights/insights-view'
import { getSession } from '@/lib/auth'
import { RealTimeHub } from '@/app/dashboard/real-time-hub'

export default async function InsightsPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <>
      <RealTimeHub userId={user.id} />
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex items-center gap-3 text-zinc-600">
              <span className="h-2 w-2 animate-ping rounded-full bg-emerald-500/60" />
              <span className="text-[12px] font-semibold uppercase tracking-widest">Loading…</span>
            </div>
          </div>
        }
      >
        <InsightsView userEmail={user.email} logoutAction={logout} serverTime={Date.now()} emailVerified={user.emailVerified} />
      </Suspense>
    </>
  )
}
