'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

interface NavMonitor {
  id: string
  url: string
  name: string | null
}

function monitorLabel(monitor: NavMonitor): string {
  if (monitor.name && monitor.name.trim().length > 0) return monitor.name
  try {
    return new URL(monitor.url).hostname
  } catch {
    return monitor.url
  }
}

export function MonitorNavDropdown({ monitors }: { monitors: NavMonitor[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return

    searchRef.current?.focus()

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setIsOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return monitors

    return monitors.filter(monitor => {
      const label = monitorLabel(monitor).toLowerCase()
      return label.includes(q) || monitor.url.toLowerCase().includes(q)
    })
  }, [monitors, query])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        Monitors
        <span className="text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-40 mt-2 w-[22rem] rounded-xl border border-border bg-surface shadow-2xl backdrop-blur-xl"
        >
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800">
            <label htmlFor="monitor-search" className="sr-only">
              Search monitors
            </label>
            <input
              ref={searchRef}
              id="monitor-search"
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search monitors..."
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10"
            />
          </div>

          <div className="max-h-90 overflow-auto pb-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-400">No monitors found.</p>
            ) : (
              filtered.map(monitor => (
                <Link
                  key={monitor.id}
                  href={`/dashboard/monitors/${monitor.id}`}
                  onClick={() => setIsOpen(false)}
                  className="block px-3 py-2 hover:bg-white/5 transition-colors"
                >
                  <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                    {monitorLabel(monitor)}
                  </p>
                  <p className="truncate text-[11px] text-zinc-400">
                    {monitor.url}
                  </p>
                </Link>
              ))
            )}
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 p-2">
            <Link
              href="/dashboard/monitors/new"
              onClick={() => setIsOpen(false)}
              className="block rounded-md px-2 py-1.5 text-xs font-bold text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              + Create monitor
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
