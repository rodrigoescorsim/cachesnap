import { redirect } from 'next/navigation'

export default function GoogleSandboxLayout({ children }: { children: React.ReactNode }) {
  if (process.env.GOOGLE_CLIENT_ID) {
    redirect('/login')
  }
  return <>{children}</>
}
