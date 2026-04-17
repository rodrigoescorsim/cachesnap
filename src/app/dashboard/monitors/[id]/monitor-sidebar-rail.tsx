'use client'

/**
 * MonitorSidebarRail — Unified 7-item navigation for a monitor's detail page.
 *
 * New structure (designed for clarity and product focus):
 *  ANALYTICS  → Live, Trends, Edge Audit
 *  INSIGHTS   → Insights (reserved for AI-powered recommendations)
 *  TOOLS      → Instant Test
 *  META       → Alerts, Settings
 *
 * Design principles:
 *  – Short labels: max 2 words, scannable at a glance.
 *  – Subtle teal/emerald active state consistent with the rest of the dashboard.
 *  – Collapse-to-icon mode persisted in localStorage for desktop users.
 *  – Single <nav> with a visual divider between analytics and utility sections.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  Lightbulb,
  RadioTower,
  Settings,
  ShieldHalf,
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

// ─── Item definitions ────────────────────────────────────────────────────────

type NavItem =
  | { kind: 'view';    view: PerformanceView; label: string; icon: React.ElementType }
  | { kind: 'tab';     tab: MonitorTab;       label: string; icon: React.ElementType }
  | { kind: 'divider' }

/**
 * The full ordered navigation spec.
 * Analytics views are grouped together; utility items follow after a divider.
 * "Insights" is listed early to signal strategic product intent.
 */
const NAV_ITEMS: NavItem[] = [
  // ── Analytics ──────────────────────────────────────────────────────────────
  { kind: 'view', view: 'real-time', label: 'Live',       icon: Zap          },
  { kind: 'view', view: 'trends',    label: 'Trends',     icon: TrendingUp   },
  { kind: 'view', view: 'edge-audit', label: 'Edge Audit', icon: ShieldHalf  },

  // ── Intelligence (future: AI recommendations & actionable advice) ──────────
  { kind: 'tab',  tab: 'insights',  label: 'Insights',   icon: Lightbulb    },

  // ── Divider ────────────────────────────────────────────────────────────────
  { kind: 'divider' },

  // ── Tools & Meta ───────────────────────────────────────────────────────────
  { kind: 'tab',  tab: 'on-demand', label: 'Instant Test', icon: FlaskConical },
  { kind: 'tab',  tab: 'incidents', label: 'Alerts',        icon: AlertCircle  },
  { kind: 'tab',  tab: 'settings',  label: 'Settings',      icon: Settings     },
]

// ─── Active state helper ──────────────────────────────────────────────────────

function isItemActive(
  item: Exclude<NavItem, { kind: 'divider' }>,
  activeTab: MonitorTab,
  activeView: PerformanceView,
): boolean {
  if (item.kind === 'view') return activeTab === 'performance' && activeView === item.view
  return activeTab === item.tab
}

function buildItemHref(
  item: Exclude<NavItem, { kind: 'divider' }>,
  range: string,
  monitorId: string,
  filteredAlertType: AlertType | null,
): string {
  if (item.kind === 'view') return buildViewHref(item.view, range, monitorId)
  return buildMonitorHref(
    item.tab,
    range,
    item.tab === 'incidents' ? filteredAlertType : null,
    '',
    monitorId,
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface MonitorSidebarRailProps {
  monitorId: string
  range: string
  activeTab: MonitorTab
  activeView: PerformanceView
  filteredAlertType: AlertType | null
}

export function MonitorSidebarRail({
  monitorId,
  range,
  activeTab,
  activeView,
  filteredAlertType,
}: MonitorSidebarRailProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  // Restore collapse preference from localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === '1') queueMicrotask(() => setCollapsed(true))
    } catch { /* ignore */ }
  }, [])

  // Track desktop breakpoint for collapse behaviour
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
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])

  const narrow = collapsed && isDesktop
  const railWidth = narrow ? 'w-full max-w-[150px] lg:w-14' : 'w-full max-w-[150px] lg:w-[150px]'
  const linkPad  = narrow ? 'justify-center px-1.5' : 'justify-start gap-2.5 px-2.5'
  const iconSize = narrow ? 'h-5 w-5' : 'h-3.5 w-3.5'

  return (
    <aside
      className={`shrink-0 transition-[width] duration-200 ease-out lg:sticky lg:top-6 ${railWidth}`}
      data-collapsed={narrow ? '' : undefined}
    >
      <div className="flex flex-col gap-0.5">

        {/* ── Collapse toggle (desktop only) ──────────────────────────────── */}
        <div className={`hidden pb-2 lg:flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40"
            aria-expanded={!narrow}
            aria-label={narrow ? 'Expand navigation' : 'Collapse navigation'}
            title={narrow ? 'Expand navigation' : 'Collapse navigation'}
          >
            {narrow
              ? <ChevronsRight className="h-4 w-4" aria-hidden />
              : <ChevronsLeft  className="h-3.5 w-3.5" aria-hidden />
            }
          </button>
        </div>

        {/* ── Main nav ────────────────────────────────────────────────────── */}
        <nav aria-label="Monitor sections">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item, i) => {
              // Render divider
              if (item.kind === 'divider') {
                return (
                  <li key={`divider-${i}`} role="separator" aria-hidden>
                    <div className={`my-2 ${narrow ? 'mx-auto w-6' : 'mx-2'} h-px bg-white/[0.06]`} />
                  </li>
                )
              }

              const active = isItemActive(item, activeTab, activeView)
              const href   = buildItemHref(item, range, monitorId, filteredAlertType)
              const Icon   = item.icon

              // "Insights" is coming soon — render with a subtle "soon" hint
              const isInsights = item.kind === 'tab' && item.tab === 'insights'

              return (
                <li key={`${item.kind}-${item.kind === 'view' ? item.view : item.tab}`}>
                  <Link
                    href={href}
                    title={narrow ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'group relative flex items-center rounded-lg py-[7px] text-[11px] font-semibold tracking-wide',
                      'transition-all duration-200 ease-out',
                      linkPad,
                      active
                        ? [
                            'border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-teal-500/5',
                            'text-white shadow-lg shadow-black/20',
                          ].join(' ')
                        : [
                            'border border-transparent',
                            isInsights
                              ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03] cursor-default opacity-70'
                              : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200',
                          ].join(' '),
                    ].join(' ')}
                  >
                    {/* Active indicator bar */}
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                        aria-hidden
                      />
                    )}

                    <Icon
                      className={[
                        `${iconSize} shrink-0 transition-colors duration-200`,
                        active
                          ? 'text-cyan-400'
                          : isInsights
                            ? 'text-zinc-600'
                            : 'text-zinc-500 group-hover:text-zinc-300',
                      ].join(' ')}
                      aria-hidden
                    />

                    <span className={`min-w-0 truncate leading-none ${narrow ? 'sr-only' : ''}`}>
                      {item.label}
                    </span>

                    {/* "Soon" badge for Insights */}
                    {isInsights && !narrow && (
                      <span className="ml-auto shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-600 ring-1 ring-zinc-700/60">
                        Soon
                      </span>
                    )}
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
