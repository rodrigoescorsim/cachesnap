'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  Lock,
  PlayCircle,
  Settings,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  buildMonitorHref,
  buildViewHref,
  type AlertType,
  type MonitorTab,
  type PerformanceView,
} from './monitor-href'

const STORAGE_KEY = 'cachesnap.monitor-sidebar-rail'

const VALID_PERFORMANCE_VIEWS = ['real-time', 'trends', 'diagnostics', 'infrastructure'] as const

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Real-time',
  trends: 'Trends',
  diagnostics: 'Diagnostics',
  infrastructure: 'Infrastructure',
}

const PERFORMANCE_VIEW_ICONS: Record<PerformanceView, typeof Activity> = {
  'real-time': Zap,
  trends: TrendingUp,
  diagnostics: Activity,
  infrastructure: Layers,
}

const TAB_LABELS: Record<'on-demand' | 'resilience' | 'security' | 'settings' | 'incidents', string> = {
  'on-demand': 'On-demand',
  resilience: 'Resilience',
  security: 'Security',
  settings: 'Settings',
  incidents: 'Alerts',
}

const TAB_ICONS = {
  'on-demand': PlayCircle,
  resilience: ShieldCheck,
  security: Lock,
  settings: Settings,
  incidents: AlertCircle,
} as const

/** After performance views; settings before alerts. */
const SECONDARY_TABS = ['on-demand', 'resilience', 'security', 'settings', 'incidents'] as const

export interface MonitorSidebarRailProps {
  range: string
  activeTab: MonitorTab
  activeView: PerformanceView
  filteredAlertType: AlertType | null
}

export function MonitorSidebarRail({
  range,
  activeTab,
  activeView,
  filteredAlertType,
}: MonitorSidebarRailProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === '1') queueMicrotask(() => setCollapsed(true))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(c => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const narrow = collapsed && isDesktop
  /** Expanded: 150px like original. Collapsed: slightly wider rail for larger icons. */
  const railWidth = narrow
    ? 'w-full max-w-[150px] lg:w-16'
    : 'w-full max-w-[150px] lg:w-[150px]'
  const linkPad = narrow ? 'justify-center px-1.5' : 'justify-start gap-2 px-2'
  const iconClass = narrow ? 'h-6 w-6' : 'h-3.5 w-3.5'

  return (
    <aside
      className={`shrink-0 transition-[width] duration-200 ease-out lg:sticky lg:top-6 ${railWidth}`}
      data-collapsed={narrow ? '' : undefined}
    >
      <div className="flex flex-col gap-1">
        <div
          className={`hidden pb-1 lg:flex ${collapsed ? 'justify-center' : 'justify-end'}`}
        >
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40"
            aria-expanded={!narrow}
            aria-label={narrow ? 'Expand navigation' : 'Collapse navigation'}
            title={narrow ? 'Expand navigation' : 'Collapse navigation'}
          >
            {narrow ? (
              <ChevronsRight className="h-6 w-6" aria-hidden />
            ) : (
              <ChevronsLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        <nav aria-label="Monitor sections">
          <ul className="space-y-0.5">
            {VALID_PERFORMANCE_VIEWS.map(v => {
              const Icon = PERFORMANCE_VIEW_ICONS[v]
              const isActive = activeTab === 'performance' && activeView === v
              const label = PERFORMANCE_VIEW_LABELS[v]
              return (
                <li key={v}>
                  <Link
                    href={buildViewHref(v, range)}
                    title={narrow ? label : undefined}
                    className={`group flex items-center rounded-lg py-2 text-xs font-bold transition-all duration-300 ${linkPad} ${
                      isActive
                        ? 'border border-white/10 bg-surface text-white shadow-xl shadow-black/20'
                        : 'border border-transparent text-zinc-500 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`${iconClass} shrink-0 transition-colors duration-300 ${
                        isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`min-w-0 truncate ${narrow ? 'sr-only' : ''}`}
                    >
                      {label}
                    </span>
                  </Link>
                </li>
              )
            })}
            {SECONDARY_TABS.map(tab => {
              const Icon = TAB_ICONS[tab]
              const isActive = activeTab === tab
              const label = TAB_LABELS[tab]
              return (
                <li key={tab}>
                  <Link
                    href={buildMonitorHref(tab, range, tab === 'incidents' ? filteredAlertType : null)}
                    title={narrow ? label : undefined}
                    className={`group flex items-center rounded-lg py-2 text-xs font-bold transition-all duration-300 ${linkPad} ${
                      isActive
                        ? 'border border-white/10 bg-surface text-white shadow-xl shadow-black/20'
                        : 'border border-transparent text-zinc-500 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`${iconClass} shrink-0 transition-colors duration-300 ${
                        isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                      }`}
                      aria-hidden
                    />
                    <span className={`min-w-0 truncate ${narrow ? 'sr-only' : ''}`}>{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </aside>
  )
}
