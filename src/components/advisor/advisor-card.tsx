'use client'

import Link from 'next/link'
import { AlertTriangle, AlertCircle, CheckCircle2, type LucideIcon } from 'lucide-react'
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
}

export function AdvisorCard({ state, variant = 'default', className = '' }: AdvisorCardProps) {
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
          <span className="shrink-0 text-[12px] font-semibold text-zinc-100">
            {state.headline}
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

      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: icon + text ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconClass}`}
            strokeWidth={2.25}
            aria-hidden
          />
          <div className="space-y-1.5">
            {/* Badge + headline */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${cfg.badgeClass}`}>
                {state.severity !== 'good' && (
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotClass} animate-pulse`} aria-hidden />
                )}
                {cfg.badgeLabel}
              </span>
              <p className="text-[13px] font-semibold leading-snug text-zinc-100">
                {state.headline}
              </p>
            </div>

            {/* Body */}
            {state.body && (
              <p className="text-[12px] font-[450] leading-relaxed text-zinc-300/90">
                {state.body}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions ─────────────────────────────────────────────────── */}
        {state.actions.length > 0 && (
          <div className="ml-7 flex shrink-0 flex-wrap items-center gap-2 sm:ml-0">
            {state.actions.map(a => (
              <ActionChip key={a.label} action={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ActionChip ───────────────────────────────────────────────────────────────

function ActionChip({ action }: { action: AdvisorAction }) {
  const cls =
    'inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-3.5 text-[11px] font-semibold text-zinc-200 transition-all duration-200 hover:border-[rgba(34,255,136,0.35)] hover:bg-[rgba(34,255,136,0.07)] hover:text-[var(--brand-primary)]'

  return action.href
    ? <Link href={action.href} className={cls}>{action.label}</Link>
    : <button type="button" className={cls}>{action.label}</button>
}
