'use client'

import Link from 'next/link'
import { AlertTriangle, AlertCircle, CheckCircle2, Info, type LucideIcon } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import type { AdvisorAction, AdvisorState, AdvisorSeverity } from './advisor-card.helpers'

// ─── Severity config ──────────────────────────────────────────────────────────

type SeverityCfg = {
  Icon: LucideIcon
  iconClass: string
  badgeLabel: string
  badgeClass: string
  dotClass: string
  bgClass: string
  ringClass: string
}

const SEV: Record<AdvisorSeverity, SeverityCfg> = {
  critical: {
    Icon: AlertTriangle,
    iconClass: 'text-rose-400',
    badgeLabel: 'CRITICAL',
    badgeClass: 'bg-rose-500/10 text-rose-300/95 ring-1 ring-inset ring-rose-500/20',
    dotClass: 'bg-rose-400',
    bgClass: 'bg-white/[0.02]',
    ringClass: 'ring-1 ring-inset ring-rose-500/20',
  },
  warning: {
    Icon: AlertCircle,
    iconClass: 'text-amber-400',
    badgeLabel: 'WARNING',
    badgeClass: 'bg-amber-500/10 text-amber-200/90 ring-1 ring-inset ring-amber-500/18',
    dotClass: 'bg-amber-400',
    bgClass: 'bg-white/[0.02]',
    ringClass: 'ring-1 ring-inset ring-amber-500/18',
  },
  good: {
    Icon: CheckCircle2,
    iconClass: 'text-metric-ttfb-fast',
    badgeLabel: 'HEALTHY',
    badgeClass: 'bg-[rgba(34,255,136,0.1)] text-[#22FF88] ring-1 ring-inset ring-[rgba(34,255,136,0.25)]',
    dotClass: 'bg-[var(--brand-primary)]',
    bgClass: 'bg-white/[0.015]',
    ringClass: '',
  },
}

// ─── AdvisorCard ──────────────────────────────────────────────────────────────

type AdvisorCardProps = {
  state: AdvisorState
  /**
   * default — two-row card with headline, body, and action buttons.
   * compact  — single-row banner; body is hidden on narrow viewports.
   */
  variant?: 'default' | 'compact'
  className?: string
  hideActions?: boolean
}

export function AdvisorCard({ state, variant = 'default', className = '', hideActions = false }: AdvisorCardProps) {
  const cfg = SEV[state.severity]
  const { Icon } = cfg

  if (variant === 'compact') {
    return (
      <div
        className={`cs-card cs-card-glass relative flex items-center gap-3 px-4 py-2.5 ${cfg.bgClass} ${cfg.ringClass} animate-[cs-fade-in_0.3s_ease-out] ${className}`}
        role="status"
        aria-label={`Advisor: ${state.headline}`}
      >
        <div className="cs-card-wash" />
        <Icon
          className={`relative z-10 h-3.5 w-3.5 shrink-0 ${cfg.iconClass}`}
          strokeWidth={2.25}
          aria-hidden
        />
        <div className="relative z-10 flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-100">
            <span>{state.headline}</span>
            {state.contextTooltip && (
              <PremiumTooltip content={state.contextTooltip} position="top-center">
                <Info className="h-3.5 w-3.5 text-zinc-400/90 hover:text-zinc-200" aria-label="Advisor details" />
              </PremiumTooltip>
            )}
          </span>
          {state.body && (
            <span className="hidden truncate text-[12px] text-zinc-400 sm:inline">
              {state.body}
            </span>
          )}
        </div>
        {state.actions[0] && (
          <div className="relative z-10 shrink-0">
            <ActionChip action={state.actions[0]} />
          </div>
        )}
      </div>
    )
  }

  // ── Default (full card) ───────────────────────────────────────────────────
  return (
    <div
      className={`cs-card cs-card-glass relative ${cfg.bgClass} ${cfg.ringClass} px-5 py-4 animate-[cs-fade-in_0.35s_ease-out] ${className}`}
      role="status"
      aria-label={`Advisor: ${state.headline}`}
    >
      <div className="cs-card-wash" />

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-stretch">
        {/* Left: icon + text ─────────────────────────────────────────────── */}
        <div className="flex-1 flex items-start gap-3 min-w-0">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconClass}`}
            strokeWidth={2.25}
            aria-hidden
          />
          <div className="space-y-1.5 min-w-0 flex-1">
            {/* Badge + headline */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${cfg.badgeClass}`}>
                {state.severity !== 'good' && (
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotClass} animate-pulse`} aria-hidden />
                )}
                {cfg.badgeLabel}
              </span>
              <p className="text-[13px] font-semibold leading-snug text-zinc-100 truncate">
                {state.headline}
              </p>
              {(state.contextTooltip || (state.causes && state.causes.length > 0)) && (
                <PremiumTooltip 
                  content={
                    state.causes && state.causes.length > 0 ? (
                      <div className="space-y-1.5 p-1">
                        <p className="text-[11px] font-bold text-zinc-200">Possible Causes:</p>
                        <ul className="list-disc pl-3 text-[12px] font-[450] text-zinc-300 marker:text-zinc-500 space-y-1">
                          {state.causes.map((cause, i) => (
                            <li key={i} className="leading-snug">{cause}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      state.contextTooltip
                    )
                  } 
                  position="top-left"
                >
                  <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400/90 hover:text-zinc-200 transition-colors cursor-help" aria-label="Advisor details" />
                </PremiumTooltip>
              )}
            </div>

            {/* Body */}
            {state.body && (
              <p className="text-[12px] font-[450] leading-relaxed text-zinc-300/90 line-clamp-2 md:line-clamp-none">
                {state.body}
              </p>
            )}
          </div>
        </div>

        {/* Right: Recommendation OR Actions ────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 md:items-end">
          {state.recommendation && (
            <div className="flex w-full items-start gap-2 rounded-lg bg-white/5 p-2.5 ring-1 ring-inset ring-white/10">
              <div className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dotClass}`} />
              <p className="text-[11px] font-medium leading-normal text-zinc-400">
                <span className="font-bold text-zinc-200">Recommendation:</span> {state.recommendation}
              </p>
            </div>
          )}

          {!hideActions && state.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {state.actions.map(a => (
                <ActionChip key={a.label} action={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ActionChip ───────────────────────────────────────────────────────────────

function ActionChip({ action }: { action: AdvisorAction }) {
  const cls =
    'inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-3.5 text-[11px] font-semibold text-zinc-200 transition-all duration-200 hover:border-[rgba(34,255,136,0.35)] hover:bg-[rgba(34,255,136,0.07)] hover:text-[var(--brand-primary)]'

  const content = action.href
    ? <Link href={action.href} className={cls}>{action.label}</Link>
    : <button type="button" className={cls}>{action.label}</button>

  if (action.tooltip) {
    return (
      <PremiumTooltip content={action.tooltip} position="top-center">
        {content}
      </PremiumTooltip>
    )
  }

  return content
}
