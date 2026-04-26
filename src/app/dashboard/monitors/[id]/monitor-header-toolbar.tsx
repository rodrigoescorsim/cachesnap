'use client'

import Link from 'next/link'
import { MoreVertical, Settings as SettingsIcon, Trash } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'

import { buildMonitorHref } from './monitor-href'
import { MonitorDeleteConfirm } from './monitor-delete-confirm'

const PAUSE_BTN =
  'inline-flex shrink-0 items-center rounded-lg border py-1 px-2.5 text-xs font-semibold leading-none transition-all disabled:opacity-50'

const MENU_TRIGGER =
  'inline-flex items-center justify-center rounded-[6px] p-[6px] text-zinc-500 transition-colors hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:bg-[rgba(255,255,255,0.06)]'

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
  const [removeOpen, setRemoveOpen] = useState(false)
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPortalNode(document.body)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    function updateCoords() {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setCoords({
          top: rect.bottom + window.scrollY + 8,
          left: rect.right + window.scrollX,
        })
      }
    }

    updateCoords()
    window.addEventListener('resize', updateCoords)
    window.addEventListener('scroll', updateCoords, true)

    function handlePointerDown(e: PointerEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
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
    <div className="flex items-center gap-2">
        <button
        type="button"
        onClick={handleToggleActive}
        disabled={pendingToggle}
        title={isActive ? 'Pause monitoring' : 'Resume monitoring'}
        className={`${PAUSE_BTN} ${
          isActive
            ? 'cs-tint-warning'
            : 'cs-tint-success'
        }`}
      >
        {pendingToggle
          ? isActive
            ? 'Pausing…'
            : 'Resuming…'
          : isActive
          ? 'Pause'
          : 'Resume'}
      </button>

      <div className="relative flex items-center">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="More actions"
          onClick={() => setMenuOpen((v) => !v)}
          className={`${MENU_TRIGGER} ${
            menuOpen ? 'bg-white/5' : ''
          }`}
        >
          <MoreVertical
            className="h-4 w-4 shrink-0 -translate-y-px"
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {menuOpen && portalNode
          ? createPortal(
              <div
                ref={menuRef}
                role="menu"
                className="cs-dropdown"
                style={{
                  position: 'absolute',
                  top: coords.top,
                  left: coords.left - 180, // Adjust to open from right
                }}
              >
                <div className="flex flex-col">
                  <Link
                    role="menuitem"
                    href={buildMonitorHref('settings', range)}
                    className="cs-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <SettingsIcon className="h-3.5 w-3.5 opacity-70" />
                    Settings
                  </Link>
                </div>
                <div className="cs-divider" />
                <div className="flex flex-col">
                  <button
                    role="menuitem"
                    type="button"
                    className="cs-item cs-item-danger"
                    onClick={() => {
                      setMenuOpen(false)
                      setRemoveOpen(true)
                    }}
                  >
                    <Trash className="h-3.5 w-3.5 opacity-70" />
                    Remove monitor
                  </button>
                </div>
              </div>,
              portalNode
            )
          : null}
      </div>
      {removeOpen ? (
        <MonitorDeleteConfirm
          monitorId={id}
          onClose={() => setRemoveOpen(false)}
        />
      ) : null}
    </div>
  )
}
