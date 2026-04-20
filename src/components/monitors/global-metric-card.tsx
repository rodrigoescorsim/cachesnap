import type { LucideIcon } from 'lucide-react'

type MetricTone = 'neutral' | 'success' | 'warning' | 'danger'

type GlobalMetricCardProps = {
  title: string
  value: string
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
  }
  metaBadge?: {
    text: string
    className: string
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
  subtitle,
  icon: Icon,
  valueClassName,
  subtitleClassName,
  badge,
  trend,
  metaBadge,
  progress,
  animationDelayMs = 0,
}: GlobalMetricCardProps) {
  return (
    <article
      className="cs-card group animate-[cs-fade-in_0.45s_ease-out] overflow-hidden px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="cs-card-wash" />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <p className="cs-metric-card-label mb-0 border-0 !text-[9px]">{title}</p>
        <div className="rounded border border-white/5 bg-white/5 p-1 text-zinc-500 transition-all duration-300 group-hover:text-metric-ttfb-fast">
          <Icon className="h-3 w-3" />
        </div>
      </div>

      <div className="relative z-10 mt-2.5 flex items-end justify-between gap-2">
        <p className={`text-[24px] font-black tracking-tighter leading-none ${valueClassName ?? 'text-zinc-100'}`}>
          {value}
        </p>
        {badge ? (
          <span className={`cs-badge ${badge.className ?? 'cs-badge-success'}`}>
            {badge.withPulseDot ? (
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${badge.dotClassName ?? 'bg-[var(--brand-primary)]'}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${badge.dotClassName ?? 'bg-[var(--brand-primary)]'}`} />
              </span>
            ) : null}
            {badge.text}
          </span>
        ) : trend ? (
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${toneClassMap[trend.tone ?? 'neutral']}`}>
            {trend.icon ? <trend.icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {trend.value}
          </span>
        ) : null}
      </div>

      {typeof progress === 'number' ? (
        <div className="relative z-10 mt-4 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ background: 'linear-gradient(to right, var(--brand-primary-dark), var(--brand-primary))', boxShadow: '0 0 12px rgba(34,255,136,0.35)', width: `${Math.max(0, Math.min(progress, 100))}%` }}
          />
        </div>
      ) : null}

      <div className="relative z-10 mt-3 flex items-center gap-2">
        {metaBadge ? <span className={metaBadge.className}>{metaBadge.text}</span> : null}
        <p className={`text-sm text-zinc-300/90 ${subtitleClassName ?? ''}`}>{subtitle}</p>
      </div>
    </article>
  )
}
