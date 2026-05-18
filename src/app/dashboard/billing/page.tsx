import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ViewSection, ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import { PLAN_LIMITS, parsePlan, type Plan } from '@/lib/plans'

const PLAN_LABELS: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' }
const PLAN_PRICES: Record<Plan, string> = { free: '$0', pro: '$19', team: '$59' }
const PLAN_PERIOD: Record<Plan, string> = { free: 'forever', pro: '/ month', team: '/ month' }

const PLAN_FEATURES: Record<Plan, string[]> = {
  free: [
    `${PLAN_LIMITS.free.monitors} monitors`,
    `${PLAN_LIMITS.free.historyDays}-day history`,
    '8 global regions',
    'Email alerts',
    'Cache & TTFB analytics',
  ],
  pro: [
    `${PLAN_LIMITS.pro.monitors} monitors`,
    `${PLAN_LIMITS.pro.historyDays}-day history`,
    '8 global regions',
    'Email alerts',
    'Cache & TTFB analytics',
    'Slack & webhook alerts',
  ],
  team: [
    `${PLAN_LIMITS.team.monitors} monitors`,
    `${PLAN_LIMITS.team.historyDays}-day history`,
    '8 global regions',
    'Email alerts',
    'Cache & TTFB analytics',
    'Slack & webhook alerts',
    'Multiple recipients',
  ],
}

const PLAN_ORDER: Plan[] = ['free', 'pro', 'team']

const UPGRADE_SUBJECT: Record<Plan, string> = {
  free: '',
  pro: 'Upgrade%20to%20Pro',
  team: 'Upgrade%20to%20Team',
}

export default async function BillingPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  const plan = parsePlan(user.plan)
  const limits = PLAN_LIMITS[plan]

  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM monitors WHERE user_id = ${user.id}
  `

  const usagePct = Math.min(100, Math.round((count / limits.monitors) * 100))
  const isAtLimit = count >= limits.monitors
  const currentPlanIndex = PLAN_ORDER.indexOf(plan)

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-2">
      <ViewSection>
        <ViewSectionHeader title="Billing & Plan" showDot={false} />
        <p className="px-1 text-xs leading-relaxed text-zinc-500">
          Manage your subscription and monitor usage.
        </p>
      </ViewSection>

      {/* Current plan */}
      <section className="cs-form-section">
        <div className="cs-card-wash" aria-hidden />
        <h2 className="cs-section-header">Current plan</h2>
        <div className="relative z-10 -mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-extrabold tracking-tight text-white">{PLAN_LABELS[plan]}</span>
            <span className="cs-badge cs-badge-success">Active</span>
          </div>
          <p className="text-sm text-zinc-400">
            {PLAN_PRICES[plan]}{' '}
            <span className="text-zinc-600">{PLAN_PERIOD[plan]}</span>
          </p>
        </div>
      </section>

      {/* Monitor usage */}
      <section className="cs-form-section">
        <div className="cs-card-wash" aria-hidden />
        <h2 className="cs-section-header">Monitor usage</h2>
        <div className="relative z-10 -mt-2 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs leading-relaxed text-zinc-400">
              {count} of {limits.monitors} monitors used
            </p>
            <span className={`text-sm font-bold ${isAtLimit ? 'text-amber-400' : 'text-zinc-400'}`}>
              {usagePct}%
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isAtLimit ? 'bg-amber-400/80' : 'bg-[var(--brand-primary)]'}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>

          {isAtLimit && (
            <p className="text-xs text-amber-400">
              Limit reached. Upgrade below to add more monitors.
            </p>
          )}
        </div>
      </section>

      {/* Included features */}
      <section className="cs-form-section">
        <div className="cs-card-wash" aria-hidden />
        <h2 className="cs-section-header">Included in your plan</h2>
        <ul className="relative z-10 -mt-2 space-y-2.5">
          {PLAN_FEATURES[plan].map((f) => (
            <li key={f} className="flex items-center gap-2.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]" strokeWidth={2.5} aria-hidden />
              <span className="text-sm text-zinc-300">{f}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Plan comparison */}
      <section className="cs-form-section">
        <div className="cs-card-wash" aria-hidden />
        <h2 className="cs-section-header">
          {plan === 'team' ? 'All plans' : 'Upgrade your plan'}
        </h2>

        <div className="relative z-10 -mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLAN_ORDER.map((p) => {
            const isCurrent = p === plan
            const isUpgrade = PLAN_ORDER.indexOf(p) > currentPlanIndex

            return (
              <div
                key={p}
                className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
                  isCurrent
                    ? 'border-[rgba(var(--brand-primary-rgb),0.25)] bg-white/[0.03]'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                }`}
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    {PLAN_LABELS[p]}
                  </p>
                  <p className="mt-0.5 text-lg font-extrabold text-white">
                    {PLAN_PRICES[p]}
                    {p !== 'free' && <span className="text-xs font-medium text-zinc-500">/mo</span>}
                  </p>
                </div>

                <ul className="flex-1 space-y-1.5">
                  <li className="text-xs text-zinc-400">{PLAN_LIMITS[p].monitors} monitors</li>
                  <li className="text-xs text-zinc-400">{PLAN_LIMITS[p].historyDays}-day history</li>
                  {p === 'free' && <li className="text-xs text-zinc-400">Email</li>}
                  {p === 'pro' && <li className="text-xs text-zinc-400">Email + Slack</li>}
                  {p === 'team' && <li className="text-xs text-zinc-400">Email + Slack + Multi</li>}
                </ul>

                {isCurrent && (
                  <span className="cs-badge cs-badge-success w-full justify-center !py-1.5">
                    Current
                  </span>
                )}

                {isUpgrade && (
                  <a
                    href={`mailto:hello@cachesnap.com?subject=${UPGRADE_SUBJECT[p]}`}
                    className="cs-btn-secondary-md w-full"
                  >
                    Upgrade →
                  </a>
                )}

                {!isCurrent && !isUpgrade && (
                  <span className="block py-1.5 text-center text-[11px] font-bold text-zinc-700">—</span>
                )}
              </div>
            )
          })}
        </div>

        {plan === 'team' && (
          <p className="relative z-10 mt-4 text-center text-xs text-zinc-600">
            Need more than {PLAN_LIMITS.team.monitors} monitors?{' '}
            <a
              href="mailto:hello@cachesnap.com"
              className="text-zinc-500 underline transition-colors hover:text-zinc-300"
            >
              Contact us
            </a>{' '}
            for a custom plan.
          </p>
        )}
      </section>
    </div>
  )
}
