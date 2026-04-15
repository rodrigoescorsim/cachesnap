'use client'

import Link from 'next/link'
import { MoreVertical, Settings as SettingsIcon, Trash } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'

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
            ? 'border-[rgba(255,180,0,0.2)] bg-[rgba(255,180,0,0.08)] text-[#ffcc66] hover:bg-[rgba(255,180,0,0.12)]'
            : 'border-[rgba(16,185,129,0.22)] bg-[rgba(16,185,129,0.1)] text-emerald-800 hover:bg-[rgba(16,185,129,0.16)] dark:text-emerald-300 dark:hover:bg-[rgba(16,185,129,0.14)]'
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
            menuOpen ? 'bg-black/[0.06] dark:bg-[rgba(255,255,255,0.06)]' : ''
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
              <>
                <style>{`
                  @keyframes menuFadeIn {
                    from { opacity: 0; transform: translateY(-2px) translateX(-100%); }
                    to { opacity: 1; transform: translateY(2px) translateX(-100%); }
                  }
                  .cs-dropdown {
                    background: rgba(17, 29, 50, 0.98) !important;
                    backdrop-filter: blur(10px) !important;
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    border-radius: 12px !important;
                    padding: 6px !important;
                    min-width: 180px !important;
                    box-shadow: 
                      0 8px 24px rgba(0, 0, 0, 0.35),
                      0 2px 8px rgba(0, 0, 0, 0.25) !important;
                    animation: menuFadeIn 0.15s ease-out forwards !important;
                    z-index: 9999 !important;
                  }
                  .cs-dropdown::before {
                    content: "";
                    position: absolute;
                    top: -4px;
                    right: 12px;
                    width: 8px;
                    height: 8px;
                    background: inherit;
                    transform: rotate(45deg);
                    border-left: 1px solid rgba(255, 255, 255, 0.08);
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    z-index: -1;
                  }
                  .cs-item {
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                    padding: 8px 10px !important;
                    border-radius: 6px !important;
                    font-size: 14px !important;
                    font-weight: 500 !important;
                    transition: all 0.15s ease-out !important;
                    cursor: pointer !important;
                    color: #cbd5e1 !important;
                    line-height: 1 !important;
                    text-decoration: none !important;
                  }
                  .cs-item:hover {
                    background: rgba(255, 255, 255, 0.06) !important;
                    color: #fff !important;
                  }
                  .cs-item-danger {
                    color: #ff6b6b !important;
                  }
                  .cs-item-danger:hover {
                    background: rgba(255, 0, 0, 0.12) !important;
                    box-shadow: inset 0 0 0 1px rgba(255, 0, 0, 0.15) !important;
                    color: #ff8787 !important;
                  }
                  .cs-divider {
                    margin: 6px 0 !important;
                    height: 1px !important;
                    background: rgba(255, 255, 255, 0.06) !important;
                  }
                `}</style>
                <div
                  ref={menuRef}
                  role="menu"
                  className="cs-dropdown"
                  style={{
                    position: 'absolute',
                    top: coords.top,
                    left: coords.left,
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
                    <Link
                      role="menuitem"
                      href={
                        buildMonitorHref('settings', range) +
                        '#settings-danger-heading'
                      }
                      className="cs-item cs-item-danger"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Trash className="h-3.5 w-3.5 opacity-70" />
                      Remove monitor
                    </Link>
                  </div>
                </div>
              </>,
              portalNode
            )
          : null}
      </div>
    </div>
  )
}
