'use client'

/**
 * Dropdown da navegação "Monitors".
 *
 * Contraste: superfície `#1e2937`; largura ~260px (`16.25rem`, +30% vs 12.5rem) para caber URLs legíveis.
 * Abertura: `cs-monitors-dropdown-panel` — scale 0.95→1 + opacity, 0.2s ease, origem top-left.
 * Lista: scroll com `cs-dropdown-scroll` (scrollbar fina em globals.css).
 */
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export type NavMonitor = {
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

type MonitorsDropdownProps = {
  monitors: NavMonitor[]
  navActive?: boolean
}

export function MonitorsDropdown({ monitors, navActive = false }: MonitorsDropdownProps) {
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
        className={`group relative inline-flex items-center gap-1.5 px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 ease-out ${
          navActive ? 'text-zinc-50' : 'text-zinc-500 hover:text-cyan-200/85'
        } after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:rounded-full after:transition-opacity after:duration-200 after:ease-out ${
          navActive
            ? 'after:bg-gradient-to-r after:from-cyan-400/70 after:via-teal-400/50 after:to-cyan-500/55 after:opacity-100'
            : 'after:bg-cyan-400/40 after:opacity-0 hover:after:opacity-100'
        } ${isOpen ? 'text-cyan-100/95' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        Monitors
        <ChevronDown
          className={`h-[11px] w-[11px] shrink-0 text-zinc-500/90 transition-transform duration-200 ease-out group-hover:text-cyan-300/40 ${isOpen ? 'rotate-180 text-cyan-400/55' : ''}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="cs-monitors-dropdown-panel absolute left-0 top-full z-40 mt-1.5 w-[min(16.25rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-500/25 bg-[#1e2937] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur-sm"
        >
          <div className="border-b border-slate-600/40 p-3">
            <label htmlFor="monitor-search" className="sr-only">
              Search monitors
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                ref={searchRef}
                id="monitor-search"
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search monitors..."
                className="h-9 w-full rounded-lg border border-slate-600/50 bg-[#0f172a]/90 py-2 pl-10 pr-3 text-[12px] leading-snug text-slate-100 placeholder:text-slate-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] transition-[border-color,box-shadow] duration-200 ease-out outline-none focus:border-cyan-500/45 focus:ring-2 focus:ring-cyan-500/15"
              />
            </div>
          </div>

          <div className="cs-dropdown-scroll max-h-[min(220px,42vh)] overflow-y-auto overscroll-contain px-2 py-2">
            {filtered.length === 0 ? (
              <p className="px-1 py-3 text-center text-[12px] font-medium text-slate-500">No monitors found.</p>
            ) : (
              <ul className="flex flex-col gap-0.5" role="listbox">
                {filtered.map(monitor => (
                  <li key={monitor.id}>
                    <Link
                      href={`/dashboard/monitors/${monitor.id}`}
                      onClick={() => setIsOpen(false)}
                      className="block rounded-lg px-2.5 py-2 transition-colors duration-200 ease-out hover:bg-white/[0.06]"
                    >
                      <p className="truncate text-[13px] font-semibold leading-tight tracking-tight text-slate-50">
                        {monitorLabel(monitor)}
                      </p>
                      <p
                        className="mt-1.5 whitespace-normal break-all font-mono text-[11px] leading-relaxed text-slate-400"
                        title={monitor.url}
                      >
                        {monitor.url}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-600/35 bg-[#172033]/80 p-2.5">
            <Link
              href="/dashboard/monitors/new"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-500/[0.12] px-3 py-2.5 text-center text-[12px] font-semibold text-cyan-200 transition-all duration-200 ease-out hover:border-cyan-400/55 hover:bg-cyan-500/22 hover:text-cyan-50 hover:shadow-[0_0_20px_-4px_rgba(34,211,238,0.35)]"
            >
              + Create monitor
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
