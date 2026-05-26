import Link from 'next/link'
import { CheckCircle2, XCircle } from 'lucide-react'
import sql from '@/lib/db'
import { Logo } from '@/components/logo'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorView message="No verification token provided." />
  }

  const [record] = await sql<{ user_id: string; expires_at: Date }[]>`
    SELECT user_id, expires_at FROM email_verification_tokens WHERE token = ${token} LIMIT 1
  `

  if (!record) {
    return <ErrorView message="This verification link is invalid or has already been used." />
  }

  if (new Date() > new Date(record.expires_at)) {
    await sql`DELETE FROM email_verification_tokens WHERE token = ${token}`
    return <ErrorView message="This verification link has expired. Request a new one from your dashboard." />
  }

  await sql`UPDATE users SET email_verified_at = NOW() WHERE id = ${record.user_id}`
  await sql`DELETE FROM email_verification_tokens WHERE token = ${token}`

  return (
    <div className="w-full max-w-sm text-center space-y-6">
      <Link href="/" className="inline-block hover:opacity-80 transition-opacity">
        <Logo className="h-16 mx-auto" />
      </Link>
      <div className="flex flex-col items-center gap-3">
        <CheckCircle2 className="h-12 w-12 text-[var(--brand-primary)]" strokeWidth={1.5} />
        <h1 className="text-xl font-bold text-white">Email verified!</h1>
        <p className="text-sm text-zinc-400">Your account is now fully secured.</p>
      </div>
      <Link
        href="/monitors"
        className="cs-btn-primary inline-flex w-full h-[42px] items-center justify-center"
      >
        Go to dashboard →
      </Link>
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="w-full max-w-sm text-center space-y-6">
      <Link href="/" className="inline-block hover:opacity-80 transition-opacity">
        <Logo className="h-16 mx-auto" />
      </Link>
      <div className="flex flex-col items-center gap-3">
        <XCircle className="h-12 w-12 text-red-400" strokeWidth={1.5} />
        <h1 className="text-xl font-bold text-white">Verification failed</h1>
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
      <Link
        href="/monitors"
        className="cs-btn-secondary-lg inline-flex w-full h-[42px] items-center justify-center"
      >
        Back to dashboard
      </Link>
    </div>
  )
}
