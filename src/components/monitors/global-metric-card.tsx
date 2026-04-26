import type { ReactNode } from 'react'
import Link from 'next/link'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { GLOBAL_HEALTH } from '@/lib/thresholds'
import { HelpCircle, type LucideIcon } from 'lucide-react'

type MetricTone = 'neutral' | 'success' | 'warning' | 'danger'

export type GlobalMetricCardVariant = 'default' | 'compact'
/** Visual grouping on the Monitors overview: insight vs raw monitor aggregates. */
export type GlobalMetricCardGroup = 'none' | 'insight' | 'monitor'

type GlobalMetricCardProps = {
  title: string
  value: string
  valueTooltip?: string
  subtitle: string
  icon: LucideIcon
  valueClassName?: string
  subtitleClassName?: string
  iconClassName?: string
  /** default = full-size card; compact = lighter strip for secondary dashboards. */
  variant?: GlobalMetricCardVariant
  /** Accent when variant is compact (Monitors page overview). */
  metricGroup?: GlobalMetricCardGroup
  badge?: {
    text: string
    className?: string
    withPulseDot?: boolean
    dotClassName?: string
  }
  trend?: {
    value: string
    tone?: MetricTone
    icon?: LucideIcon
    description?: string
    tooltip?: string
  }
  metaBadge?: {
    text: string
    className: string
  }
  statusFooter?: {
    label: string
    tone: MetricTone
    context: string
  }
  progress?: number
  animationDelayMs?: number
  /** Special elite glow effect for perfect metrics (e.g. 100% cache hit or ultra-low TTFB). */
  isElite?: boolean
  /**
   * Monitors overview: replaces big metric / badge / trend / progress / footer
   * with degraded vs critical active-monitor counts.
   */
  systemStatus?:
  | 'loading'
  | {
    degraded: number
    critical: number
    degradedMonitors: ReadonlyArray<{ id: string; name: string }>
    criticalMonitors: ReadonlyArray<{ id: string; name: string }>
  }
}

function MonitorBandTooltip({
  monitors,
  emptyMessage,
  ariaLabel,
  trigger,
}: {
  monitors: ReadonlyArray<{ id: string; name: string }>
  emptyMessage: string
  ariaLabel: string
  /** When set, used instead of the help icon (e.g. “View issues” text). */
  trigger?: ReactNode
}) {
  const content =
    monitors.length === 0 ? (
      <p className="min-w-0 max-w-[min(280px,calc(100vw-2rem))] text-[11px] leading-relaxed text-zinc-300">
        {emptyMessage}
      </p>
    ) : (
      <ul className="list-none space-y-1 p-0.5 text-left text-[11px] leading-snug">
        {monitors.map((m) => (
          <li key={m.id}>
            <Link
              href={`/dashboard/monitors/${m.id}`}
              className="block rounded px-0.5 py-0.5 text-zinc-200 underline-offset-2 hover:bg-white/5 hover:text-white hover:underline"
            >
              {m.name}
            </Link>
          </li>
        ))}
      </ul>
    )

  return (
    <PremiumTooltip
      content={content}
      position="top-right"
      direction="top"
      interactive
      panelSizing="hug"
    >
      {trigger ?? (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          aria-label={ariaLabel}
        >
          <HelpCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
        </button>
      )}
    </PremiumTooltip>
  )
}

const SYSTEM_STATUS_DEGRADED_TOOLTIP = (
  <p className="max-w-[14rem] text-[11px] leading-snug text-zinc-200">
    <span className="font-semibold tabular-nums">
      {GLOBAL_HEALTH.DEGRADED}–{GLOBAL_HEALTH.HEALTHY - 1}
    </span>
    : weak TTFB or cache. Improve soon.
  </p>
)

const SYSTEM_STATUS_CRITICAL_TOOLTIP = (
  <p className="max-w-[14rem] text-[11px] leading-snug text-zinc-200">
    Below <span className="font-semibold tabular-nums">{GLOBAL_HEALTH.DEGRADED}</span>
    : bad TTFB or cache. Fix first.
  </p>
)

function SystemStatusBandLabel({
  children,
  tooltip,
  className,
}: {
  children: string
  tooltip: ReactNode
  className: string
}) {
  return (
    <PremiumTooltip content={tooltip} position="top-left" direction="top">
      <span
        className={`cursor-help border-b border-dotted text-[11px] font-bold uppercase tracking-widest ${className}`}
      >
        {children}
      </span>
    </PremiumTooltip>
  )
}

function groupRingClass(metricGroup: GlobalMetricCardGroup): string {
  if (metricGroup === 'insight') return 'ring-1 ring-inset ring-violet-500/20'
  if (metricGroup === 'monitor') return 'ring-1 ring-inset ring-emerald-500/15'
  return ''
}

const toneClassMap: Record<MetricTone, string> = {
  neutral: 'text-zinc-400',
  success: 'text-metric-ttfb-fast',
  warning: 'text-amber-400',
  danger: 'text-rose-500',
}

export function GlobalMetricCard({
  title,
  value,
  valueTooltip,
  subtitle,
  icon: Icon,
  valueClassName,
  subtitleClassName,
  variant = 'default',
  metricGroup = 'none',
  badge,
  trend,
  metaBadge,
  statusFooter,
  progress,
  animationDelayMs = 0,
  systemStatus,
  iconClassName,
  isElite = false,
}: GlobalMetricCardProps) {
  const isCompact = variant === 'compact'
  const isSystemStatus = systemStatus !== undefined
  const titleClass = isCompact
    ? 'cs-metric-card-label mb-0 border-0 !text-[9px] font-bold tracking-widest text-zinc-500'
    : 'cs-metric-card-label mb-0 border-0 !text-[10px] font-black tracking-widest text-zinc-500'
  const valueSizeClass = isCompact ? 'text-[22px]' : 'text-[28px]'
  const iconWrapClass = isCompact
    ? 'rounded-md border border-white/5 bg-white/[0.04] p-1 text-zinc-500'
    : 'rounded-lg border border-white/5 bg-white/5 p-1.5 text-zinc-500 transition-all duration-300 group-hover:bg-[rgba(34,255,136,0.1)] group-hover:text-metric-ttfb-fast'
  const iconSizeClass = isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'
  const trendTextClass = isCompact ? 'text-[11px]' : 'text-[13px]'

  /** Compact = same `cs-card` surface as the design system, tighter padding, no hover lift. */
  const articleClass = isCompact
    ? `cs-card group relative flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden px-4 py-3 ${groupRingClass(metricGroup)}`
    : 'cs-card group relative animate-[cs-fade-in_0.45s_ease-out] overflow-hidden px-5 py-4 transition-all duration-300 hover:-translate-y-0.5'

  return (
    <article
      className={articleClass}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="cs-card-wash" />

      {/* Header: Title + Icon */}
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div>
          <p className={titleClass}>
            {title}
          </p>
        </div>
        <div className={iconWrapClass}>
          <Icon className={`${iconSizeClass} ${iconClassName ?? ''}`} />
        </div>
      </div>

      {/* Main Value + Badge/Trend — hidden for system status layout */}
      {!isSystemStatus ? (
        <>
          <div className={`relative z-10 flex items-baseline justify-between gap-2 ${isCompact ? 'mt-1.5' : 'mt-2'}`}>
            {valueTooltip ? (
              <PremiumTooltip content={valueTooltip} position="top-left">
                <p className={`cursor-help ${valueSizeClass} font-black tracking-tighter leading-none ${isElite ? 'text-metric-elite drop-shadow-[0_0_12px_rgba(34,255,136,0.4)]' : (valueClassName ?? 'text-zinc-100')}`}>
                  {value}
                </p>
              </PremiumTooltip>
            ) : (
              <p className={`${valueSizeClass} font-black tracking-tighter leading-none ${isElite ? 'text-metric-elite drop-shadow-[0_0_12px_rgba(34,255,136,0.4)]' : (valueClassName ?? 'text-zinc-100')}`}>
                {value}
              </p>
            )}

            <div className="flex flex-col items-end">
              {badge ? (
                <span className={`cs-badge ${badge.className ?? 'cs-badge-success'} !min-h-0 ${isCompact ? '!py-px !px-1.5 !text-[8px]' : '!py-0.5 !px-2 !text-[9px]'}`}>
                  {badge.text}
                </span>
              ) : trend ? (
                <div className="flex flex-col items-end gap-1">
                  {trend.tooltip ? (
                    <PremiumTooltip content={trend.tooltip} position="top-right">
                      <span className={`cursor-help inline-flex items-center gap-1 ${trendTextClass} font-extrabold tabular-nums ${toneClassMap[trend.tone ?? 'neutral']}`}>
                        {trend.icon ? <trend.icon className={`${isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} stroke-[3]`} aria-hidden="true" /> : null}
                        {trend.value}
                      </span>
                    </PremiumTooltip>
                  ) : (
                    <span className={`inline-flex items-center gap-1 ${trendTextClass} font-extrabold tabular-nums ${toneClassMap[trend.tone ?? 'neutral']}`}>
                      {trend.icon ? <trend.icon className={`${isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} stroke-[3]`} aria-hidden="true" /> : null}
                      {trend.value}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {typeof progress === 'number' ? (
            <div className={`relative z-10 overflow-hidden rounded-full bg-white/5 shadow-inner ${isCompact ? 'mt-2.5 h-1' : 'mt-4.5 h-1.5'}`}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  background: 'linear-gradient(to right, var(--brand-primary-dark), var(--brand-primary))',
                  boxShadow: '0 0 10px rgba(34,255,136,0.3)',
                  width: `${Math.max(0, Math.min(progress, 100))}%`,
                }}
              />
            </div>
          ) : null}

          {(subtitle || metaBadge) && (
            <div
              className={`relative z-10 flex items-center gap-2 ${isCompact ? 'mt-2' : progress === undefined ? 'mt-3' : 'mt-2.5'}`}
            >
              {metaBadge ? <span className={`${metaBadge.className} !py-px !px-1! !text-[9px]`}>{metaBadge.text}</span> : null}
              {subtitle && (
                <p className={`${isCompact ? 'text-[11px]' : 'text-[12px]'} font-medium text-zinc-400/90 leading-tight ${subtitleClassName ?? ''}`}>
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {statusFooter &&
            (isCompact ? (
              <p className="relative z-10 mt-2 text-[10px] font-medium leading-snug text-zinc-500">
                <span className={`font-semibold uppercase tracking-wide ${toneClassMap[statusFooter.tone]}`}>
                  {statusFooter.label}
                </span>
                <span className="text-zinc-600"> · </span>
                {statusFooter.context}
              </p>
            ) : (
              <div className="relative z-10 mt-3 flex flex-col gap-1">
                <span className={`text-[10px] font-black tracking-widest ${toneClassMap[statusFooter.tone]}`}>
                  {statusFooter.label}
                </span>
                <p className="text-[11px] font-medium leading-snug text-zinc-500">{statusFooter.context}</p>
              </div>
            ))}
        </>
      ) : (
        <div className="relative z-10 mt-1.5 min-w-0 space-y-1" aria-label="Monitor health counts">
          {systemStatus === 'loading' ? (
            <>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <SystemStatusBandLabel
                  tooltip={SYSTEM_STATUS_CRITICAL_TOOLTIP}
                  className="border-zinc-600/50 text-zinc-500"
                >
                  CRITICAL
                </SystemStatusBandLabel>
                <span className="text-[11px] font-semibold tabular-nums text-zinc-500">…</span>
              </div>
              <div className="my-0.5 border-b border-white/[0.06]" />
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <SystemStatusBandLabel
                  tooltip={SYSTEM_STATUS_DEGRADED_TOOLTIP}
                  className="border-zinc-600/50 text-zinc-500"
                >
                  DEGRADED
                </SystemStatusBandLabel>
                <span className="text-[11px] font-semibold tabular-nums text-zinc-500">…</span>
              </div>
            </>
          ) : (
            <>
              {systemStatus.critical === 0 ? (
                <p className="min-w-0 text-[11px] leading-snug text-zinc-400">
                  <span className="font-medium text-metric-ttfb-fast/95">All clear</span>
                  <span className="text-zinc-500"> — </span>
                  <span>no active monitors in the </span>
                  <SystemStatusBandLabel
                    tooltip={SYSTEM_STATUS_CRITICAL_TOOLTIP}
                    className="border-zinc-600/50 text-zinc-400"
                  >
                    CRITICAL
                  </SystemStatusBandLabel>
                  <span> band.</span>
                </p>
              ) : (
                <div className="flex min-w-0 items-baseline gap-x-2">
                  <SystemStatusBandLabel
                    tooltip={SYSTEM_STATUS_CRITICAL_TOOLTIP}
                    className="shrink-0 border-rose-500/40 text-rose-400/95"
                  >
                    CRITICAL
                  </SystemStatusBandLabel>
                  <div className="ml-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 text-right">
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-300">
                      {systemStatus.critical === 1
                        ? '1 monitor impacted'
                        : `${systemStatus.critical} monitors impacted`}
                    </span>
                    <span className="text-[11px] text-zinc-600">–</span>
                    <MonitorBandTooltip
                      monitors={systemStatus.criticalMonitors}
                      emptyMessage="No active monitors are in the critical health band."
                      ariaLabel="Which monitors are critical"
                      trigger={
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-rose-300/95 underline-offset-2 transition-colors hover:text-rose-200 hover:underline"
                          aria-label="Which monitors are critical"
                        >
                          View issues
                        </button>
                      }
                    />
                  </div>
                </div>
              )}
              <div className="my-0.5 border-b border-white/[0.06]" />
              {systemStatus.degraded === 0 ? (
                <div className="flex min-w-0 items-baseline gap-x-2">
                  <SystemStatusBandLabel
                    tooltip={SYSTEM_STATUS_DEGRADED_TOOLTIP}
                    className="shrink-0 border-zinc-600/50 text-zinc-400"
                  >
                    DEGRADED
                  </SystemStatusBandLabel>
                  <div className="ml-auto flex min-w-0 items-baseline justify-end gap-1">
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-400">0 monitors</span>
                    <MonitorBandTooltip
                      monitors={systemStatus.degradedMonitors}
                      emptyMessage="No active monitors are in the degraded health band."
                      ariaLabel="Which monitors are degraded"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-baseline gap-x-2">
                  <SystemStatusBandLabel
                    tooltip={SYSTEM_STATUS_DEGRADED_TOOLTIP}
                    className="shrink-0 border-amber-500/40 text-amber-400/95"
                  >
                    DEGRADED
                  </SystemStatusBandLabel>
                  <div className="ml-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 text-right">
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-300">
                      {systemStatus.degraded === 1
                        ? '1 monitor impacted'
                        : `${systemStatus.degraded} monitors impacted`}
                    </span>
                    <span className="text-[11px] text-zinc-600">–</span>
                    <MonitorBandTooltip
                      monitors={systemStatus.degradedMonitors}
                      emptyMessage="No active monitors are in the degraded health band."
                      ariaLabel="Which monitors are degraded"
                      trigger={
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-amber-300/95 underline-offset-2 transition-colors hover:text-amber-200 hover:underline"
                          aria-label="Which monitors are degraded"
                        >
                          View issues
                        </button>
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </article>
  )
}
