import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ViewSection, ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import { SettingsForms } from './settings-forms'

export default async function SettingsPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  const [oauthRow] = await sql`
    SELECT id FROM accounts WHERE user_id = ${user.id} AND provider = 'google' LIMIT 1
  `

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-2">
      <ViewSection>
        <ViewSectionHeader title="Account Settings" showDot={false} />
        <p className="px-1 text-xs leading-relaxed text-zinc-500">
          Manage your email, password, and account.
        </p>
      </ViewSection>
      <SettingsForms currentEmail={user.email} isOAuthUser={!!oauthRow} />
    </div>
  )
}
