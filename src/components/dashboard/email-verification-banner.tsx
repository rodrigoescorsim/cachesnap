'use client'

import { useState, useTransition } from 'react'
import { Mail } from 'lucide-react'
import { resendVerificationEmail } from '@/app/actions/auth'

export function EmailVerificationBanner({ userEmail }: { userEmail: string }) {
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleResend() {
    startTransition(async () => {
      await resendVerificationEmail()
      setSent(true)
    })
  }

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/[0.05] px-4 py-2">
      <div className="cs-container-adaptive flex items-center gap-3">
        <Mail className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <p className="flex-1 text-xs text-amber-300/90">
          Check your inbox to verify{' '}
          <span className="font-semibold text-amber-200">{userEmail}</span>
          {' '}and secure your account.
        </p>
        {sent ? (
          <span className="shrink-0 text-xs font-semibold text-amber-200">Sent ✓</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={isPending}
            className="shrink-0 text-xs font-bold text-amber-300 underline underline-offset-2 transition-colors hover:text-amber-100 disabled:opacity-50"
          >
            {isPending ? 'Sending…' : 'Resend'}
          </button>
        )}
      </div>
    </div>
  )
}
