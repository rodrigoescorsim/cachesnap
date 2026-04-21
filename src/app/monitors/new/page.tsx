import { redirect } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { getSession } from '@/lib/auth'
import { NewMonitorPage } from '@/components/monitors/new-monitor-page'

export default async function MonitorsNewPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  return <NewMonitorPage userEmail={user.email} logoutAction={logout} />
}
