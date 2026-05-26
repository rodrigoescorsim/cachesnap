import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { dodo } from '@/lib/dodo'
import { ViewSection, ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import { PLAN_LIMITS, parsePlan, type Plan } from '@/lib/plans'
import { UpgradeButton, ManageButton } from '@/components/billing/upgrade-button'
import { BillingSuccessVerifier } from '@/components/billing/billing-success-verifier'
import { BillingAutoCheckout } from '@/components/billing/billing-auto-checkout'

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
  ],
}

const PLAN_ORDER: Plan[] = ['free', 'pro', 'team']


export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; subscription_id?: string; checkout?: string; plan_changed?: string; activated?: string }>
}) {
  const user = await getSession()
  if (!user) redirect('/login')

  const params = await searchParams
  const pendingSubscriptionId =
    params.success === '1' && params.subscription_id ? params.subscription_id : null
  const autoCheckoutPlan =
    (params.checkout === 'pro' || params.checkout === 'team') && parsePlan(user.plan) === 'free'
      ? params.checkout
      : null
  const planChanged = params.plan_changed === '1'
  const planActivated = params.activated === '1'

  const plan = parsePlan(user.plan)
  const limits = PLAN_LIMITS[plan]

  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM monitors WHERE user_id = ${user.id}
  `
  const [{ dodo_subscription_id }] = await sql<[{ dodo_subscription_id: string | null }]>`
    SELECT dodo_subscription_id FROM users WHERE id = ${user.id}
  `

  // Check if subscription is scheduled for cancellation
  let cancellingAt: string | null = null
  if (dodo_subscription_id) {
    try {
      const sub = await dodo.subscriptions.retrieve(dodo_subscription_id)
      if (sub.cancel_at_next_billing_date) {
        cancellingAt = sub.next_billing_date
      }
    } catch {
      // Non-critical: if Dodo is unreachable, skip the warning
    }
  }

  const usagePct = Math.min(100, Math.round((count / limits.monitors) * 100))
  const isAtLimit = count >= limits.monitors
  const currentPlanIndex = PLAN_ORDER.indexOf(plan)

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-2">
      {autoCheckoutPlan && <BillingAutoCheckout plan={autoCheckoutPlan} />}
      {pendingSubscriptionId && (
        <BillingSuccessVerifier subscriptionId={pendingSubscriptionId} />
      )}
      {planActivated && (
        <div className="flex items-start gap-3 rounded-xl border border-[rgba(var(--brand-primary-rgb),0.25)] bg-[rgba(var(--brand-primary-rgb),0.06)] px-4 py-4">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" strokeWidth={2.5} />
          <div>
            <p className="text-sm font-bold text-[var(--brand-primary)]">Subscription activated.</p>
            <p className="mt-0.5 text-xs text-zinc-400">Welcome aboard! Your plan is now active.</p>
          </div>
        </div>
      )}
      {planChanged && (
        <div className="flex items-start gap-3 rounded-xl border border-[rgba(var(--brand-primary-rgb),0.25)] bg-[rgba(var(--brand-primary-rgb),0.06)] px-4 py-4">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" strokeWidth={2.5} />
          <div>
            <p className="text-sm font-bold text-[var(--brand-primary)]">Plan upgraded successfully.</p>
            <p className="mt-0.5 text-xs text-zinc-400">Your plan has been updated. A prorated charge for the current billing period may appear shortly.</p>
          </div>
        </div>
      )}
      {cancellingAt && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4">
          <span className="mt-0.5 shrink-0 text-sm text-amber-400">⚠</span>
          <div>
            <p className="text-sm font-bold text-amber-400">Your subscription is scheduled to cancel.</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              You keep full access until{' '}
              <span className="font-semibold text-zinc-300">
                {new Date(cancellingAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              . After that, your account reverts to the Free plan. To reactivate, use <span className="font-semibold text-zinc-300">Manage subscription</span> below.
            </p>
          </div>
        </div>
      )}

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
            {cancellingAt
              ? <span className="cs-badge cs-badge-warning">Cancels {new Date(cancellingAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              : <span className="cs-badge cs-badge-success">Active</span>
            }
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
                  {p === 'pro' && <li className="text-xs text-zinc-400">Email + Slack + Webhooks</li>}
                  {p === 'team' && <li className="text-xs text-zinc-400">Email + Slack + Webhooks</li>}
                </ul>

                {isCurrent && (
                  <div className="space-y-2">
                    <span className="cs-badge cs-badge-success w-full justify-center !py-1.5">
                      Current
                    </span>
                    {dodo_subscription_id && p !== 'free' && <ManageButton />}
                  </div>
                )}

                {isUpgrade && (p === 'pro' || p === 'team') && (
                  <UpgradeButton plan={p} label="Upgrade →" />
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
