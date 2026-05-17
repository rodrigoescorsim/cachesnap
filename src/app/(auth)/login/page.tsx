'use client'

import { useState, useActionState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { login } from '@/app/actions/auth'
import { Logo } from '@/components/logo'
import { Eye, EyeOff, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)
  const [showPassword, setShowPassword] = useState(false)
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'

  // Consolidate all form validation or credential errors
  const allErrors = state?.errors ? Object.values(state.errors).flat() : []

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-4 hover:opacity-80 transition-opacity">
          <Logo className="h-16" />
        </Link>
        <h1 className="text-xl font-bold text-white tracking-tight">Welcome back</h1>
        <p className="text-[15px] font-extrabold text-zinc-200 mt-2.5 max-w-[290px] leading-snug tracking-tight">
          Monitor your edge performance <span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(34,255,136,0.4)]">with zero code</span>
        </p>
      </div>

      {resetSuccess && (
        <div className="cs-tint-success rounded-xl flex items-center gap-3 p-4 text-[12px] font-bold leading-relaxed mb-5 shadow-[0_0_20px_rgba(34,255,136,0.06)] animate-[cs-fade-in_0.3s_ease-out]">
          <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400 drop-shadow-[0_0_6px_rgba(34,255,136,0.5)]" />
          <span>Password reset successfully! You can now sign in.</span>
        </div>
      )}

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
            Email
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

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="password" className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-white transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
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

        <button
          type="submit"
          disabled={pending}
          className="cs-btn-primary w-full h-[42px] disabled:opacity-85 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/30 hover:scale-[1.005] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin text-zinc-950 drop-shadow-[0_0_6px_rgba(34,255,136,0.85)]" />
              <span className="text-zinc-900 font-extrabold">Signing in…</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-white/5"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-zinc-600 font-black tracking-widest text-[9px]">Or continue with</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          alert('Google authentication is currently in sandbox mode.')
        }}
        className="cs-btn-outline w-full h-[42px] !py-0 !text-xs !font-bold flex items-center justify-center gap-2 border border-white/10 hover:border-zinc-500 bg-white/[0.02] hover:bg-white/[0.08] transition-all duration-300 hover:shadow-[0_0_25px_rgba(255,255,255,0.08)] hover:scale-[1.01] active:scale-[0.98]"
      >
        <svg className="h-4 w-4 drop-shadow-[0_0_3px_rgba(255,255,255,0.2)]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
        </svg>
        <span>Google</span>
      </button>

      <p className="mt-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
        No account?{' '}
        <Link href="/signup" className="text-white hover:underline lowercase font-bold normal-case">
          Sign up free
        </Link>
      </p>

      <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600">
        <Lock className="h-3.5 w-3.5 text-emerald-400/80" />
        <span>Secure Encrypted Login</span>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

