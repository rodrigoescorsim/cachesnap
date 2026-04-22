import { PremiumTooltip } from '@/components/premium-tooltip'
import type { LucideIcon } from 'lucide-react'

type MetricTone = 'neutral' | 'success' | 'warning' | 'danger'

type GlobalMetricCardProps = {
  title: string
  value: string
  valueTooltip?: string
  subtitle: string
  icon: LucideIcon
  valueClassName?: string
  subtitleClassName?: string
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
  badge,
  trend,
  metaBadge,
  statusFooter,
  progress,
  animationDelayMs = 0,
}: GlobalMetricCardProps) {
  return (
    <article
      className="cs-card group relative animate-[cs-fade-in_0.45s_ease-out] overflow-hidden px-5 py-4 transition-all duration-300 hover:-translate-y-0.5"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="cs-card-wash" />

      {/* Header: Title + Icon */}
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div>
          <p className="cs-metric-card-label mb-0 border-0 !text-[10px] font-black tracking-widest text-zinc-500">
            {title}
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/5 p-1.5 text-zinc-500 transition-all duration-300 group-hover:bg-[rgba(34,255,136,0.1)] group-hover:text-metric-ttfb-fast">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Main Value + Badge/Trend */}
      <div className="relative z-10 mt-2 flex items-baseline justify-between gap-2">
        {valueTooltip ? (
          <PremiumTooltip content={valueTooltip} position="top-left">
            <p className={`cursor-help text-[28px] font-black tracking-tighter leading-none ${valueClassName ?? 'text-zinc-100'}`}>
              {value}
            </p>
          </PremiumTooltip>
        ) : (
          <p className={`text-[28px] font-black tracking-tighter leading-none ${valueClassName ?? 'text-zinc-100'}`}>
            {value}
          </p>
        )}
        
        <div className="flex flex-col items-end">
          {badge ? (
            <span className={`cs-badge ${badge.className ?? 'cs-badge-success'} !min-h-0 !py-0.5 !px-2 !text-[9px]`}>
              {badge.text}
            </span>
          ) : trend ? (
            <div className="flex flex-col items-end gap-1">
              {trend.tooltip ? (
                <PremiumTooltip content={trend.tooltip} position="top-right">
                <span className={`cursor-help inline-flex items-center gap-1 text-[13px] font-extrabold tabular-nums ${toneClassMap[trend.tone ?? 'neutral']}`}>
                  {trend.icon ? <trend.icon className="h-3 w-3 stroke-[3]" aria-hidden="true" /> : null}
                  {trend.value}
                </span>
                </PremiumTooltip>
              ) : (
                <span className={`inline-flex items-center gap-1 text-[13px] font-extrabold tabular-nums ${toneClassMap[trend.tone ?? 'neutral']}`}>
                  {trend.icon ? <trend.icon className="h-3 w-3 stroke-[3]" aria-hidden="true" /> : null}
                  {trend.value}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Progress Bar (Health Score only) */}
      {typeof progress === 'number' ? (
        <div className="relative z-10 mt-4.5 h-1.5 overflow-hidden rounded-full bg-white/5 shadow-inner">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ 
              background: 'linear-gradient(to right, var(--brand-primary-dark), var(--brand-primary))', 
              boxShadow: '0 0 10px rgba(34,255,136,0.3)', 
              width: `${Math.max(0, Math.min(progress, 100))}%` 
            }}
          />
        </div>
      ) : null}

      {/* Subtitle */}
      {(subtitle || metaBadge) && (
        <div className={`relative z-10 ${progress === undefined ? 'mt-3' : 'mt-2.5'} flex items-center gap-2`}>
          {metaBadge ? <span className={`${metaBadge.className} !py-px !px-1! !text-[9px]`}>{metaBadge.text}</span> : null}
          {subtitle && <p className={`text-[12px] font-medium text-zinc-400/90 leading-tight ${subtitleClassName ?? ''}`}>{subtitle}</p>}
        </div>
      )}

      {/* Status Footer: label uses tone; context is neutral detail */}
      {statusFooter && (
        <div className="relative z-10 mt-3 flex flex-col gap-1">
          <span
            className={`text-[10px] font-black tracking-widest ${toneClassMap[statusFooter.tone]}`}
          >
            {statusFooter.label}
          </span>
          <p className="text-[11px] font-medium leading-snug text-zinc-500">{statusFooter.context}</p>
        </div>
      )}
    </article>
  )
}
