import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-auth'

export const metadata = { title: 'Admin — CacheSnap' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession()
  if (!admin) redirect('/login')

  return (
    <div className="min-h-full flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/96 shadow-[0_1px_0_0_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="cs-container-adaptive flex h-14 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
              CacheSnap
            </span>
            <span className="text-zinc-700">/</span>
            <span className="cs-badge cs-badge-warning text-[9px]">Admin</span>
          </div>
          <span className="text-[11px] font-medium text-zinc-600">{admin.email}</span>
        </div>
      </header>
      <main className="cs-container-adaptive flex-1 py-8">
        {children}
      </main>
    </div>
  )
}
