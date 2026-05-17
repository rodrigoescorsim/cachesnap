'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '@/app/actions/auth'
import { Logo } from '@/components/logo'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined)

  const allErrors = state?.errors ? Object.values(state.errors).flat() : []

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-4 hover:opacity-80 transition-opacity">
          <Logo className="h-16" />
        </Link>
        <h1 className="text-xl font-bold text-white tracking-tight">Reset your password</h1>
        <p className="text-[15px] font-extrabold text-zinc-200 mt-2.5 max-w-[290px] leading-snug tracking-tight">
          Enter your email to <span className="text-emerald-400 font-extrabold drop-shadow-[0_0_10px_rgba(34,255,136,0.4)]">receive a reset link</span>
        </p>
      </div>

      {state?.success ? (
        <div className="space-y-6 text-center animate-[cs-fade-in_0.3s_ease-out]">
          <div className="cs-tint-success rounded-xl flex flex-col items-center gap-3 p-6 shadow-[0_0_20px_rgba(34,255,136,0.06)]">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 drop-shadow-[0_0_8px_rgba(34,255,136,0.4)]" />
            <p className="text-sm font-extrabold uppercase tracking-wider text-emerald-400 drop-shadow-[0_0_10px_rgba(34,255,136,0.3)]">Reset link sent! ✅</p>
            <p className="text-[12px] font-semibold text-zinc-300 leading-relaxed">
              If an account is associated with this email, we have sent a secure password reset link. Please check your inbox (and spam folder).
            </p>
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mt-1 border-t border-white/5 pt-3 w-full">
              The link will expire in 1 hour.
            </p>
          </div>
          <Link
            href="/login"
            className="cs-btn-outline w-full h-[42px] !py-0 !text-xs !font-bold flex items-center justify-center gap-2 border border-white/10 hover:border-zinc-500 bg-white/[0.02] hover:bg-white/[0.08] transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] text-white hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Login</span>
          </Link>
        </div>
      ) : (
        <>
          {allErrors.length > 0 && (
            <div className="cs-tint-error rounded-xl flex flex-col gap-2.5 p-4 text-[12px] font-bold leading-relaxed mb-5 shadow-[0_0_20px_rgba(244,63,94,0.06)] animate-[cs-fade-in_0.3s_ease-out]">
              {allErrors.map((err, index) => (
                <div key={index} className="flex items-center gap-2.5">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          <form action={action} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="cs-input w-full h-10 px-3 py-2 text-sm font-medium"
                placeholder="you@domain.com"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="cs-btn-primary w-full h-[42px] disabled:opacity-85 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/30 hover:scale-[1.005] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-zinc-950 drop-shadow-[0_0_6px_rgba(34,255,136,0.85)]" />
                  <span className="text-zinc-900 font-extrabold">Sending link…</span>
                </>
              ) : (
                <span>Send Reset Link</span>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            Remember your password?{' '}
            <Link href="/login" className="text-white hover:underline lowercase font-bold normal-case">
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
