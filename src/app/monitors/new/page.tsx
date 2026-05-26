import { redirect } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { getSession } from '@/lib/auth'
import { NewMonitorPage } from '@/components/monitors/new-monitor-page'
import sql from '@/lib/db'
import { getMonitorLimit } from '@/lib/plans'

export default async function MonitorsNewPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM monitors WHERE user_id = ${user.id}
  `
  const monitorLimit = getMonitorLimit(user.plan)

  return (
    <NewMonitorPage
      userEmail={user.email}
      logoutAction={logout}
      plan={user.plan}
      monitorCount={count}
      monitorLimit={monitorLimit}
      emailVerified={user.emailVerified}
    />
  )
}
