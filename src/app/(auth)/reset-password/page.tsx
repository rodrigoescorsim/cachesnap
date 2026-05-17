'use client'

import { useState, useActionState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { resetPassword } from '@/app/actions/auth'
import { Logo } from '@/components/logo'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [state, action, pending] = useActionState(resetPassword, undefined)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const allErrors = state?.errors ? Object.values(state.errors).flat() : []

  return (
    <>
      {!token ? (
        <div className="cs-tint-error rounded-xl flex items-center gap-3 p-4 text-[12px] font-bold leading-relaxed mb-5 shadow-[0_0_20px_rgba(244,63,94,0.06)] animate-[cs-fade-in_0.3s_ease-out]">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
          <span>Invalid or missing reset token. Please check your link or request a new one.</span>
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
            {/* Pass token in a hidden input */}
            <input type="hidden" name="token" value={token} />

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="cs-input w-full h-10 pl-3 pr-10 py-2 text-sm font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  className="cs-input w-full h-10 pl-3 pr-10 py-2 text-sm font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="cs-btn-primary w-full h-[42px] disabled:opacity-85 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/30 hover:scale-[1.005] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-zinc-950 drop-shadow-[0_0_6px_rgba(34,255,136,0.85)]" />
                  <span className="text-zinc-900 font-extrabold">Saving password…</span>
                </>
              ) : (
                <span>Reset Password</span>
              )}
            </button>
          </form>
        </>
      )}
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-4 hover:opacity-80 transition-opacity">
          <Logo className="h-16" />
        </Link>
        <h1 className="text-xl font-bold text-white tracking-tight">Set a new password</h1>
        <p className="text-[15px] font-extrabold text-zinc-200 mt-2.5 max-w-[290px] leading-snug tracking-tight">
          Create a secure password <span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(34,255,136,0.4)]">for your account</span>
        </p>
      </div>

      <Suspense fallback={
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
