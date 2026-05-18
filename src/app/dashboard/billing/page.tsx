import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
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

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--brand-primary)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
    </svg>
  )
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
    <div className="max-w-2xl mx-auto py-4">

      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Billing & Plan</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your subscription and monitor usage.</p>
      </div>

      {/* Current plan */}
      <div
        className="rounded-2xl border p-6 mb-5"
        style={{ borderColor: 'rgba(var(--brand-primary-rgb), 0.2)', background: 'rgba(var(--brand-primary-rgb), 0.03)' }}
      >
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Current plan</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-extrabold text-white">{PLAN_LABELS[plan]}</span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'rgba(var(--brand-primary-rgb), 0.12)', color: 'var(--brand-primary)', border: '1px solid rgba(var(--brand-primary-rgb), 0.2)' }}
            >
              Active
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            {PLAN_PRICES[plan]}{' '}
            <span className="text-zinc-600">{PLAN_PERIOD[plan]}</span>
          </p>
        </div>
      </div>

      {/* Monitor usage */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-white">Monitor usage</p>
            <p className="text-xs text-zinc-500 mt-0.5">{count} of {limits.monitors} monitors used</p>
          </div>
          <span className={`text-sm font-bold ${isAtLimit ? 'text-amber-400' : 'text-zinc-400'}`}>
            {usagePct}%
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${usagePct}%`,
              background: isAtLimit ? 'rgba(245,158,11,0.8)' : 'var(--brand-primary)',
            }}
          />
        </div>

        {isAtLimit && (
          <p className="mt-3 text-xs text-amber-400">
            Limit reached. Upgrade below to add more monitors.
          </p>
        )}
      </div>

      {/* Included features */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Included in your plan</p>
        <ul className="space-y-2.5">
          {PLAN_FEATURES[plan].map((f) => (
            <li key={f} className="flex items-center gap-2.5">
              <CheckIcon />
              <span className="text-sm text-zinc-300">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Plan comparison */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
          {plan === 'team' ? 'All plans' : 'Upgrade your plan'}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {PLAN_ORDER.map((p) => {
            const isCurrent = p === plan
            const isUpgrade = PLAN_ORDER.indexOf(p) > currentPlanIndex

            return (
              <div
                key={p}
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={isCurrent ? {
                  borderColor: 'rgba(var(--brand-primary-rgb), 0.25)',
                  background: 'rgba(var(--brand-primary-rgb), 0.04)',
                } : {
                  borderColor: 'rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{PLAN_LABELS[p]}</p>
                  <p className="text-lg font-extrabold text-white mt-0.5">
                    {PLAN_PRICES[p]}
                    {p !== 'free' && <span className="text-xs font-medium text-zinc-500">/mo</span>}
                  </p>
                </div>

                <ul className="space-y-1.5 flex-1">
                  <li className="text-xs text-zinc-400">{PLAN_LIMITS[p].monitors} monitors</li>
                  <li className="text-xs text-zinc-400">{PLAN_LIMITS[p].historyDays}-day history</li>
                  {p === 'free' && <li className="text-xs text-zinc-400">Email</li>}
                  {p === 'pro' && <li className="text-xs text-zinc-400">Email + Slack</li>}
                  {p === 'team' && <li className="text-xs text-zinc-400">Email + Slack + Multi</li>}
                </ul>

                {isCurrent && (
                  <span
                    className="block text-center rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--brand-primary)', background: 'rgba(var(--brand-primary-rgb), 0.1)' }}
                  >
                    Current
                  </span>
                )}

                {isUpgrade && (
                  <a
                    href={`mailto:hello@cachesnap.com?subject=${UPGRADE_SUBJECT[p]}`}
                    className="block text-center rounded-lg border border-zinc-700/60 bg-zinc-800/50 py-1.5 text-[11px] font-bold text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
                  >
                    Upgrade →
                  </a>
                )}

                {!isCurrent && !isUpgrade && (
                  <span className="block text-center rounded-lg py-1.5 text-[11px] font-bold text-zinc-700">
                    —
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {plan === 'team' && (
          <p className="mt-4 text-xs text-zinc-600 text-center">
            Need more than {PLAN_LIMITS.team.monitors} monitors?{' '}
            <a href="mailto:hello@cachesnap.com" className="text-zinc-500 underline hover:text-zinc-300 transition-colors">
              Contact us
            </a>{' '}
            for a custom plan.
          </p>
        )}
      </div>

    </div>
  )
}
