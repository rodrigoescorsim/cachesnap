import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { SettingsForms } from './settings-forms'

export default async function SettingsPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  const [oauthRow] = await sql`
    SELECT id FROM accounts WHERE user_id = ${user.id} AND provider = 'google' LIMIT 1
  `

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Account Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your email, password, and account.</p>
      </div>
      <SettingsForms currentEmail={user.email} isOAuthUser={!!oauthRow} />
    </div>
  )
}
