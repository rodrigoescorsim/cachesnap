'use client'

/**
 * Dropdown da conta (avatar / "Signed in as").
 *
 * Contraste: `#172033` + borda `slate-500/25` — painel claramente separado do fundo `#020617` da página.
 * Abertura: `cs-user-dropdown-panel` — scale 0.95→1 + opacity, 0.2s ease, origem top-right (alinhado ao trigger).
 * Sign out: tom neutro com hover vermelho suave (ação destrutiva sem gritar).
 */
import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'

function emailInitials(email: string): string {
  const local = email.split('@')[0] ?? email
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 2)
  }
  return local.slice(0, 2).toUpperCase()
}

type UserDropdownProps = {
  email: string
  logoutAction: () => Promise<void>
}

export function UserDropdown({ email, logoutAction }: UserDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials = emailInitials(email)

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center justify-end">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="group flex max-w-full items-center gap-2.5 rounded-lg py-0.5 pl-1 pr-2 transition-[background-color,transform] duration-200 ease-out hover:bg-white/[0.04] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 via-teal-500/8 to-slate-900/90 text-[9px] font-semibold tracking-wide text-cyan-100/90 ring-1 ring-white/[0.12] transition-transform duration-200 ease-out group-hover:scale-[1.04] group-hover:ring-cyan-400/25 group-active:scale-[0.96]"
          aria-hidden
        >
          {initials}
        </span>
        <span className="hidden max-w-[min(220px,28vw)] truncate text-left text-[11px] font-medium text-zinc-500 transition-colors duration-200 ease-out group-hover:text-zinc-300 md:inline">
          {email}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="cs-user-dropdown-panel absolute right-0 top-full z-[60] mt-2 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-500/25 bg-[#172033] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur-sm"
        >
          <div className="border-b border-slate-600/35 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Signed in as</p>
            <p className="mt-2 break-all text-[13px] font-medium leading-snug text-slate-100" title={email}>
              {email}
            </p>
          </div>
          <div className="p-2">
            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-slate-300 transition-colors duration-200 ease-out hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus-visible:bg-red-500/10 focus-visible:ring-1 focus-visible:ring-red-500/25"
              >
                <LogOut
                  className="h-4 w-4 shrink-0 text-slate-500 transition-colors duration-200 ease-out group-hover:text-red-400/90"
                  strokeWidth={2}
                />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
