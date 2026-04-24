'use client'

import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  Layers,
  Lock,
  Settings,
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

const MONITORING_VIEWS = ['real-time', 'trends', 'diagnostics'] as const
const INFRASTRUCTURE_VIEW = 'infrastructure' as const

const PERFORMANCE_VIEW_LABELS: Record<PerformanceView, string> = {
  'real-time': 'Live',
  trends: 'Trends',
  diagnostics: 'Diagnostics',
  infrastructure: 'Edge Audit',
}

const PERFORMANCE_VIEW_ICONS: Record<PerformanceView, typeof Activity> = {
  'real-time': Zap,
  trends: TrendingUp,
  diagnostics: Activity,
  infrastructure: Layers,
}

const TAB_LABELS: Record<'security' | 'settings' | 'incidents', string> = {
  security: 'Security',
  settings: 'Settings',
  incidents: 'Alerts',
}

const TAB_ICONS = {
  security: Lock,
  settings: Settings,
  incidents: AlertCircle,
} as const

const CONFIG_TABS = ['settings', 'incidents'] as const

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
  const railWidth = 'w-full max-w-[150px] lg:w-[150px]'
  const linkPad = 'justify-start gap-2.5 px-3'
  const iconClass = 'h-3.5 w-3.5'
  const sectionLabelClass = 'px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500/90'

  return (
    <aside
      className={`shrink-0 transition-[width] duration-200 ease-out lg:sticky lg:top-20 ${railWidth}`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(14,34,66,0.68)_0%,rgba(6,20,42,0.82)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/10" />
        <div className="flex flex-col gap-2 p-2 lg:p-2.5">
          <nav aria-label="Monitor sections">
            <div className="space-y-3">
              <section aria-label="Monitoring navigation" className="space-y-1.5">
                <p className={sectionLabelClass}>Monitoring</p>
                <ul className="space-y-2">
                  {MONITORING_VIEWS.map(v => {
                    const Icon = PERFORMANCE_VIEW_ICONS[v]
                    const isActive = activeTab === 'performance' && activeView === v
                    const label = PERFORMANCE_VIEW_LABELS[v]
                    return (
                      <li key={v}>
                        <Link
                          href={buildViewHref(v, range, monitorId)}
                          title={label}
                          className={`group relative flex items-center rounded-xl py-2.5 text-xs font-bold transition-all duration-200 ease-out ${linkPad} ${
                            isActive
                              ? 'border border-emerald-300/20 bg-emerald-400/10 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.20)] motion-safe:animate-[pulse_0.2s_ease-out_1]'
                              : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <Icon
                            className={`${iconClass} shrink-0 transition-colors duration-300 ${
                              isActive ? 'text-metric-ttfb-fast' : 'text-zinc-500 group-hover:text-zinc-300'
                            }`}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate">{label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section aria-label="Infrastructure navigation" className="space-y-1.5">
                <p className={sectionLabelClass}>Infrastructure</p>
                <ul className="space-y-2">
                  <li key={INFRASTRUCTURE_VIEW}>
                    <Link
                      href={buildViewHref(INFRASTRUCTURE_VIEW, range, monitorId)}
                      title={PERFORMANCE_VIEW_LABELS[INFRASTRUCTURE_VIEW]}
                      className={`group relative flex items-center rounded-xl py-2.5 text-xs font-bold transition-all duration-200 ease-out ${linkPad} ${
                        activeTab === 'performance' && activeView === INFRASTRUCTURE_VIEW
                          ? 'border border-emerald-300/20 bg-emerald-400/10 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.20)] motion-safe:animate-[pulse_0.2s_ease-out_1]'
                          : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Layers
                        className={`${iconClass} shrink-0 transition-colors duration-300 ${
                          activeTab === 'performance' && activeView === INFRASTRUCTURE_VIEW
                            ? 'text-metric-ttfb-fast'
                            : 'text-zinc-500 group-hover:text-zinc-300'
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{PERFORMANCE_VIEW_LABELS[INFRASTRUCTURE_VIEW]}</span>
                    </Link>
                  </li>

                  <li key="security">
                    <Link
                      href={buildMonitorHref('security', range, null, '', monitorId)}
                      title={TAB_LABELS.security}
                      className={`group relative flex items-center rounded-xl py-2.5 text-xs font-bold transition-all duration-200 ease-out ${linkPad} ${
                        activeTab === 'security'
                          ? 'border border-emerald-300/20 bg-emerald-400/10 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.20)] motion-safe:animate-[pulse_0.2s_ease-out_1]'
                          : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Lock
                        className={`${iconClass} shrink-0 transition-colors duration-300 ${
                          activeTab === 'security' ? 'text-metric-ttfb-fast' : 'text-zinc-400 group-hover:text-zinc-300'
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{TAB_LABELS.security}</span>
                    </Link>
                  </li>
                </ul>
              </section>

              <section aria-label="Configuration navigation" className="space-y-1.5">
                <p className={sectionLabelClass}>Configuration</p>
                <ul className="space-y-2">
                  {CONFIG_TABS.map(tab => {
                    const Icon = TAB_ICONS[tab]
                    const isActive = activeTab === tab
                    const label = TAB_LABELS[tab]
                    return (
                      <li key={tab}>
                        <Link
                          href={buildMonitorHref(tab, range, tab === 'incidents' ? filteredAlertType : null, '', monitorId)}
                          title={label}
                          className={`group relative flex items-center rounded-xl py-2.5 text-xs font-bold transition-all duration-200 ease-out ${linkPad} ${
                            isActive
                              ? 'border border-emerald-300/20 bg-emerald-400/10 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.20)] motion-safe:animate-[pulse_0.2s_ease-out_1]'
                              : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <Icon
                            className={`${iconClass} shrink-0 transition-colors duration-300 ${
                              isActive ? 'text-metric-ttfb-fast' : 'text-zinc-400 group-hover:text-zinc-300'
                            }`}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate">{label}</span>
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
