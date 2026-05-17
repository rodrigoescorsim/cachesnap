'use client'

import { useState, useActionState, startTransition } from 'react'
import Link from 'next/link'
import { loginGoogleSandbox } from '@/app/actions/auth'
import { Logo } from '@/components/logo'
import { Loader2, ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react'

export default function GoogleSandboxPage() {
  const [state, action, pending] = useActionState(loginGoogleSandbox, undefined)
  const [customEmail, setCustomEmail] = useState('')

  const allErrors = state?.errors ? Object.values(state.errors).flat() : []

  const handleSelectAccount = (email: string) => {
    if (pending) return
    const formData = new FormData()
    formData.append('email', email)
    startTransition(() => {
      action(formData)
    })
  }

  return (
    <div className="w-full max-w-md bg-white/[0.02] border border-white/5 rounded-2xl p-8 backdrop-blur-md shadow-2xl animate-[cs-fade-in_0.3s_ease-out]">
      <div className="mb-6 flex flex-col items-center text-center">
        <Link href="/" className="mb-4 hover:opacity-80 transition-opacity">
          <Logo className="h-12" />
        </Link>
        
        {/* Sandbox Dev Banner */}
        <div className="mb-6 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-start gap-3 text-left">
          <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-amber-400">OAuth Sandbox Active</h2>
            <p className="text-[11px] text-zinc-300 leading-relaxed mt-1 font-semibold">
              Google client credentials are not defined in <code className="text-white bg-white/5 px-1 py-0.5 rounded">.env</code>. You are running in interactive sandbox mode. Select or enter any email to simulate the Google login.
            </p>
          </div>
        </div>

        <h1 className="text-lg font-bold text-white tracking-tight">Choose an account</h1>
        <p className="text-xs font-semibold text-zinc-400 mt-1">to continue to <span className="text-emerald-400 font-extrabold">CacheSnap</span></p>
      </div>

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

      {/* Account List */}
      <div className="space-y-3 mb-6">
        {/* Rodrigo's Account */}
        <button
          type="button"
          disabled={pending}
          onClick={() => handleSelectAccount('rodrigo.escorsim@gmail.com')}
          className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.05] hover:border-zinc-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all text-left group disabled:opacity-75 disabled:cursor-not-allowed"
        >
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-extrabold text-emerald-400 group-hover:bg-emerald-500/20 group-hover:drop-shadow-[0_0_8px_rgba(34,255,136,0.3)] transition-all">
            RE
          </div>
          <div>
            <p className="text-sm font-bold text-white">Rodrigo Escorsim</p>
            <p className="text-xs text-zinc-400 font-medium">rodrigo.escorsim@gmail.com</p>
          </div>
        </button>

        {/* Demo Account */}
        <button
          type="button"
          disabled={pending}
          onClick={() => handleSelectAccount('dev@cachesnap.com')}
          className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.05] hover:border-zinc-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all text-left group disabled:opacity-75 disabled:cursor-not-allowed"
        >
          <div className="h-10 w-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-extrabold text-indigo-400 group-hover:bg-indigo-500/20 group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.3)] transition-all">
            DD
          </div>
          <div>
            <p className="text-sm font-bold text-white">Demo Developer</p>
            <p className="text-xs text-zinc-400 font-medium">dev@cachesnap.com</p>
          </div>
        </button>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-white/5"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
          <span className="bg-[#0b0c0e] px-2 text-zinc-500">Or use a custom account</span>
        </div>
      </div>

      {/* Custom Form */}
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
            Google Account Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={pending}
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
            className="cs-input w-full h-10 px-3 py-2 text-sm font-medium"
            placeholder="name@gmail.com"
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
              <span className="text-zinc-900 font-extrabold">Signing in with Google…</span>
            </>
          ) : (
            <span>Sign in as Custom User</span>
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Login</span>
        </Link>
      </div>
    </div>
  )
}
