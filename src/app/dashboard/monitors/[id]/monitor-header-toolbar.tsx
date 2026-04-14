'use client'

import Link from 'next/link'
import { MoreVertical } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { buildMonitorHref } from './monitor-href'

const PAUSE_BTN =
  'inline-flex shrink-0 items-center rounded-lg border py-1 px-2.5 text-xs font-semibold leading-none transition-all disabled:opacity-50'

const MENU_TRIGGER =
  'inline-flex items-center justify-center rounded-[6px] p-[6px] text-zinc-600 transition-colors hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:bg-[rgba(255,255,255,0.06)]'

export function MonitorHeaderToolbar({
  id,
  isActive,
  range,
}: {
  id: string
  isActive: boolean
  range: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pendingToggle, setPendingToggle] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  function handleToggleActive() {
    if (pendingToggle) return
    setPendingToggle(true)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !isActive }),
        })
        if (res.ok) router.refresh()
      } finally {
        setPendingToggle(false)
      }
    })
  }

  return (
    <div ref={wrapRef} className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggleActive}
        disabled={pendingToggle}
        title={isActive ? 'Pause monitoring' : 'Resume monitoring'}
        className={`${PAUSE_BTN} ${
          isActive
            ? 'border-[rgba(255,180,0,0.2)] bg-[rgba(255,180,0,0.08)] text-[#ffcc66] hover:bg-[rgba(255,180,0,0.12)]'
            : 'border-[rgba(16,185,129,0.22)] bg-[rgba(16,185,129,0.1)] text-emerald-800 hover:bg-[rgba(16,185,129,0.16)] dark:text-emerald-300 dark:hover:bg-[rgba(16,185,129,0.14)]'
        }`}
      >
        {pendingToggle
          ? (isActive ? 'Pausing…' : 'Resuming…')
          : (isActive ? 'Pause' : 'Resume')}
      </button>

      <div className="relative flex items-center">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="More actions"
          onClick={() => setMenuOpen((v) => !v)}
          className={`${MENU_TRIGGER} ${
            menuOpen ? 'bg-black/[0.06] dark:bg-[rgba(255,255,255,0.06)]' : ''
          }`}
        >
          <MoreVertical
            className="h-4 w-4 shrink-0 -translate-y-px"
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[10rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <Link
              role="menuitem"
              href={buildMonitorHref('settings', range)}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => setMenuOpen(false)}
            >
              Settings
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
