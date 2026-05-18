'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
import { changePassword, deleteAccount } from '@/app/actions/settings'

type ActionResult = { errors?: Record<string, string[]>; success?: boolean }

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="cs-tint-success relative z-10 flex items-center gap-3 rounded-lg p-4 text-[12px] font-bold leading-relaxed animate-[cs-fade-in_0.3s_ease-out]">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
      <span>{message}</span>
    </div>
  )
}

function ErrorBanner({ messages }: { messages: string[] }) {
  return (
    <div className="cs-tint-error relative z-10 flex flex-col gap-2 rounded-lg p-4 text-[12px] font-bold leading-relaxed animate-[cs-fade-in_0.3s_ease-out]">
      {messages.map((msg) => (
        <div key={msg} className="flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{msg}</span>
        </div>
      ))}
    </div>
  )
}

// ── Change Password ───────────────────────────────────────────────────────────

function ChangePasswordForm({ isOAuthUser }: { isOAuthUser: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(changePassword, undefined)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const globalErrors = state?.errors?.global ?? []

  if (isOAuthUser) {
    return (
      <section className="cs-form-section">
        <div className="cs-card-wash" aria-hidden />
        <h2 className="cs-section-header">Password</h2>
        <div className="relative z-10 flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <svg className="h-5 w-5 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          <p className="text-xs leading-relaxed text-zinc-400">
            Password is managed by Google. Sign in with Google to change your credentials.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="cs-form-section">
      <div className="cs-card-wash" aria-hidden />
      <h2 className="cs-section-header">Password</h2>
      <p className="relative z-10 -mt-2 mb-6 text-xs leading-relaxed text-zinc-400">
        Choose a strong password at least 8 characters long.
      </p>

      <div className="relative z-10 space-y-4">
        {state?.success && <SuccessBanner message="Password changed. Other active sessions have been signed out." />}
        {globalErrors.length > 0 && <ErrorBanner messages={globalErrors} />}

        {!state?.success && (
          <form action={action} className="space-y-4">
            {[
              { id: 'currentPassword', label: 'Current password', show: showCurrent, toggle: () => setShowCurrent(v => !v), errors: state?.errors?.currentPassword },
              { id: 'newPassword', label: 'New password', show: showNew, toggle: () => setShowNew(v => !v), errors: state?.errors?.newPassword },
              { id: 'confirmNewPassword', label: 'Confirm new password', show: showConfirm, toggle: () => setShowConfirm(v => !v), errors: state?.errors?.confirmNewPassword },
            ].map(({ id, label, show, toggle, errors }) => (
              <div key={id}>
                <label htmlFor={id} className="cs-label">
                  {label}
                </label>
                <div className="relative">
                  <input
                    id={id}
                    name={id}
                    type={show ? 'text' : 'password'}
                    autoComplete={id === 'currentPassword' ? 'current-password' : 'new-password'}
                    required
                    placeholder="••••••••"
                    className={`w-full h-11 cs-input pr-10 ${errors?.length ? 'cs-input-error' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={toggle}
                    className="absolute right-3 top-1/2 z-20 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors && errors.length > 0 && (
                  <span className="cs-error-msg">{errors[0]}</span>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={pending}
              className="cs-btn-primary h-10 rounded-lg px-5 text-sm font-bold disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Change password'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

// ── Delete Account ────────────────────────────────────────────────────────────

function DeleteAccountForm({ isOAuthUser, currentEmail }: { isOAuthUser: boolean; currentEmail: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(deleteAccount, undefined)
  const [expanded, setExpanded] = useState(false)

  const confirmErrors = state?.errors?.confirmation ?? []
  const globalErrors = state?.errors?.global ?? []

  return (
    <section className="cs-danger-card">
      <div className="cs-card-wash" aria-hidden />
      <h2 className="cs-danger-header">Delete account</h2>
      <p className="mb-6 ml-3.5 max-w-sm text-xs text-red-500/50">
        Permanently delete your account and all monitors. This cannot be undone.
      </p>

      <div className="ml-3.5">
        {!expanded ? (
          <div className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-red-500/30 hover:bg-red-500/5">
            <div>
              <h3 className="text-sm font-bold text-zinc-200 transition-colors group-hover:text-red-500">
                Permanently delete account
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                All monitors and probe history will be removed forever.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="h-9 shrink-0 rounded-lg border border-white/5 bg-white/5 px-4 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-all hover:border-red-500 hover:bg-red-500 hover:text-white"
            >
              Delete account...
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            {globalErrors.length > 0 && <ErrorBanner messages={globalErrors} />}

            <form action={action} className="space-y-4">
              <div>
                <label htmlFor="confirmation" className="cs-label">
                  {isOAuthUser
                    ? 'Type your email to confirm'
                    : 'Enter your password to confirm'}
                  {isOAuthUser && (
                    <span className="ml-1 opacity-50">— {currentEmail}</span>
                  )}
                </label>
                <input
                  id="confirmation"
                  name="confirmation"
                  type={isOAuthUser ? 'email' : 'password'}
                  autoComplete={isOAuthUser ? 'email' : 'current-password'}
                  required
                  placeholder={isOAuthUser ? currentEmail : '••••••••'}
                  className={`w-full h-11 cs-input ${confirmErrors.length ? 'cs-input-error' : 'border-red-500/20 focus:border-red-500/40'}`}
                />
                {confirmErrors.length > 0 && (
                  <span className="cs-error-msg">{confirmErrors[0]}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="h-9 rounded-lg border border-red-500/40 bg-red-500/15 px-4 text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50"
                >
                  {pending ? 'Deleting…' : 'Permanently delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Root Export ───────────────────────────────────────────────────────────────

export function SettingsForms({
  currentEmail,
  isOAuthUser,
}: {
  currentEmail: string
  isOAuthUser: boolean
}) {
  return (
    <div className="space-y-8">
      <ChangePasswordForm isOAuthUser={isOAuthUser} />
      <DeleteAccountForm isOAuthUser={isOAuthUser} currentEmail={currentEmail} />
    </div>
  )
}
