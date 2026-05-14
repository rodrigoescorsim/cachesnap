'use client'

import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  BarChart2,
  CalendarDays,
  ChevronLeft,
  Layers,
  LineChart,
  Lock,
  Radio,
  Settings,
  ScrollText,
} from 'lucide-react'
import {
  buildMonitorHref,
  buildViewHref,
  type AlertType,
  type MonitorTab,
  type PerformanceView,
} from './monitor-href'

const MONITORING_VIEWS = ['real-time', 'performance', 'trends', 'patterns', 'infrastructure'] as const

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Live',
  performance: 'Performance',
  trends: 'Trends',
  patterns: 'Patterns',
  infrastructure: 'Edge vs Origin',
}

const PERFORMANCE_VIEW_ICONS: Record<PerformanceView, typeof Activity> = {
  'real-time': Radio,
  performance: BarChart2,
  trends: LineChart,
  patterns: CalendarDays,
  infrastructure: Layers,
}

const TAB_LABELS: Record<'security' | 'settings' | 'incidents' | 'alert-history', string> = {
  security: 'Security',
  settings: 'Settings',
  incidents: 'Incidents',
  'alert-history': 'Alert History',
}

const TAB_ICONS = {
  security: Lock,
  settings: Settings,
  incidents: AlertCircle,
  'alert-history': ScrollText,
} as const

const CONFIG_TABS = ['settings', 'incidents', 'alert-history'] as const

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
  /** Below `xl`: wrapped chip rail so the main column keeps full width. */
  const railWidth = 'w-full max-w-none xl:w-[160px] xl:max-w-[160px] xl:shrink-0'
  const linkLayoutClass =
    'justify-start items-start gap-2.5 max-xl:items-center max-xl:gap-2 xl:gap-2'
  const itemBaseClass =
    'relative flex rounded-xl px-2 py-2 text-[11px] font-bold leading-snug transition-all duration-200 ease-out max-xl:shrink-0 xl:px-2 xl:py-2 xl:text-xs xl:leading-snug'
  const itemListClass =
    'space-y-1.5 max-xl:flex max-xl:flex-row max-xl:flex-wrap max-xl:space-y-0 max-xl:gap-x-1.5 max-xl:gap-y-2 max-xl:min-w-0'
  const sectionClass =
    'space-y-2.5 max-xl:flex max-xl:flex-row max-xl:flex-wrap max-xl:items-center max-xl:space-y-0 max-xl:gap-x-2 max-xl:gap-y-2 max-xl:max-w-full max-xl:min-w-0'
  const iconClass = 'h-3.5 w-3.5'
  const sectionLabelClass =
    'px-2.5 pb-1 text-[8px] font-black uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-700'
  const itemStateClass = (isActive: boolean) =>
    isActive
      ? 'border border-emerald-300/20 bg-emerald-400/10 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.20)] motion-safe:animate-[pulse_0.2s_ease-out_1]'
      : 'border border-transparent text-zinc-300/90 hover:bg-white/5 hover:text-white'

  return (
    <aside
      className={`transition-[width] duration-200 ease-out xl:sticky xl:top-20 ${railWidth}`}
    >
      <div className="relative overflow-hidden rounded-xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col gap-2 p-2 xl:p-2">
          <nav aria-label="Monitor sections">
            <div className="space-y-3.5 max-xl:flex max-xl:flex-row max-xl:flex-wrap max-xl:items-center max-xl:gap-x-3 max-xl:gap-y-2 max-xl:space-y-0 max-xl:w-full max-xl:pb-0.5">
              <section aria-label="Back navigation" className={sectionClass}>
                <ul className={itemListClass}>
                  <li>
                    <Link
                      href="/monitors"
                      className={`group ${itemBaseClass} ${linkLayoutClass} ${itemStateClass(false)}`}
                    >
                      <ChevronLeft
                        className={`${iconClass} mt-0.5 shrink-0 text-zinc-500 transition-colors duration-300 group-hover:text-zinc-300`}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">Monitors</span>
                    </Link>
                  </li>
                </ul>
              </section>

              <section aria-label="Performance views, Edge vs Origin, and security" className={sectionClass}>
                <div className="max-xl:hidden">
                  <p className={sectionLabelClass}>Monitoring</p>
                </div>
                <ul className={itemListClass}>
                  {MONITORING_VIEWS.map(v => {
                    const Icon = PERFORMANCE_VIEW_ICONS[v]
                    const isActive = activeTab === 'performance' && activeView === v
                    const label = PERFORMANCE_VIEW_LABELS[v]
                    return (
                      <li key={v}>
                        <Link
                          href={buildViewHref(v, range, monitorId)}
                          className={`group ${itemBaseClass} ${linkLayoutClass} ${itemStateClass(isActive)}`}
                        >
                          <Icon
                            className={`${iconClass} mt-0.5 shrink-0 transition-colors duration-300 ${isActive ? 'text-metric-ttfb-fast' : 'text-zinc-500 group-hover:text-zinc-300'
                              }`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 break-words text-left [overflow-wrap:anywhere]">{label}</span>
                        </Link>
                      </li>
                    )
                  })}

                  <li key="security">
                    <Link
                      href={buildMonitorHref('security', range, null, null, '', monitorId)}
                      className={`group ${itemBaseClass} ${linkLayoutClass} ${itemStateClass(activeTab === 'security')}`}
                    >
                      <Lock
                        className={`${iconClass} mt-0.5 shrink-0 transition-colors duration-300 ${activeTab === 'security' ? 'text-metric-ttfb-fast' : 'text-zinc-400 group-hover:text-zinc-300'
                          }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 break-words text-left [overflow-wrap:anywhere]">{TAB_LABELS.security}</span>
                    </Link>
                  </li>
                </ul>
              </section>

              <section aria-label="Configuration navigation" className={sectionClass}>
                <div className="max-xl:hidden">
                  <p className={sectionLabelClass}>Configuration</p>
                </div>
                <ul className={itemListClass}>
                  {CONFIG_TABS.map(tab => {
                    const Icon = TAB_ICONS[tab]
                    const isActive = activeTab === tab
                    const label = TAB_LABELS[tab]
                    return (
                      <li key={tab}>
                        <Link
                          href={buildMonitorHref(
                            tab,
                            range,
                            tab === 'alert-history' ? filteredAlertType : null,
                            null,
                            '',
                            monitorId,
                          )}
                          className={`group ${itemBaseClass} ${linkLayoutClass} ${itemStateClass(isActive)}`}
                        >
                          <Icon
                            className={`${iconClass} mt-0.5 shrink-0 transition-colors duration-300 ${isActive ? 'text-metric-ttfb-fast' : 'text-zinc-400 group-hover:text-zinc-300'
                              }`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 break-words text-left [overflow-wrap:anywhere]">{label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          </nav>
        </div>
      </div>
    </aside>
  )
}
