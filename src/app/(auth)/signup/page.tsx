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
          <p className="mt-1.5 text-[10px] uppercase tracking-wider font-bold text-zinc-500">Minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="cs-btn-primary w-full h-[42px] disabled:opacity-50"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-zinc-500 font-medium">
        Already have an account?{' '}
        <Link href="/login" className="text-white hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
