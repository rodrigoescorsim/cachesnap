'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signup } from '@/app/actions/auth'
import { Logo } from '@/components/logo'

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined)

  return (
    <div className="w-full max-w-sm">
      <div className="mb-10 flex flex-col items-center">
        <Link href="/" className="mb-6 hover:opacity-80 transition-opacity">
          <Logo className="h-16" />
        </Link>
        <p className="text-sm text-zinc-500 font-medium">Create your free account</p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="cs-input w-full h-10 px-3 py-2 text-sm font-medium"
          />
          {state?.errors?.email && (
            <p className="mt-1 text-xs text-red-500">{state.errors.email[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="cs-input w-full h-10 px-3 py-2 text-sm font-medium"
          />
          {state?.errors?.password && (
            <p className="mt-1 text-xs text-red-500">{state.errors.password[0]}</p>
          )}
          <p className="mt-1.5 text-[10px] uppercase tracking-wider font-bold text-zinc-600">Minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="cs-btn-primary w-full h-[42px] disabled:opacity-50"
        >
          {pending ? 'Creating account…' : 'Create account'}
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

      <Link
        href="/api/auth/google"
        className="cs-btn-outline w-full h-[42px] !py-0 !text-xs !font-bold flex items-center justify-center gap-2 border border-white/10 hover:border-zinc-500 bg-white/[0.02] hover:bg-white/[0.08] transition-all duration-300 hover:shadow-[0_0_25px_rgba(255,255,255,0.08)] hover:scale-[1.01] active:scale-[0.98] text-white hover:text-white"
      >
        <svg className="h-4 w-4 drop-shadow-[0_0_3px_rgba(255,255,255,0.2)]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
        </svg>
        <span>Google</span>
      </Link>

      <p className="mt-8 text-center text-sm text-zinc-500 font-medium">
        Already have an account?{' '}
        <Link href="/login" className="text-white hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
