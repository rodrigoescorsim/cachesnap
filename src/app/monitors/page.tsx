import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { MonitorsStageOne } from '@/components/monitors/monitors-stage-one'
import { getSession } from '@/lib/auth'
import { RealTimeHub } from '@/app/dashboard/real-time-hub'

// MonitorsStageOne uses useSearchParams, which requires a Suspense boundary
// so the route can prerender everything above the boundary while the search
// params are resolved client-side.
export default async function MonitorsPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <>
      <RealTimeHub userId={user.id} />
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex items-center gap-3 text-zinc-600">
            <span className="h-2 w-2 animate-ping rounded-full" style={{ background: 'var(--brand-primary)', opacity: 0.6 }} />
            <span className="text-[12px] font-semibold uppercase tracking-widest">Loading…</span>
          </div>
        </div>
      }>
        <MonitorsStageOne
          userEmail={user.email}
          logoutAction={logout}
          serverTime={Date.now()}
        />
      </Suspense>
    </>
  )
}
