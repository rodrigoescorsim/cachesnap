import Link from 'next/link'
import { Logo } from '@/components/logo'

// ─── Data ────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with edge monitoring. No credit card required.',
    cta: 'Get started free',
    ctaHref: '/signup',
    highlighted: false,
    monitors: 2,
    historyDays: 7,
    features: [
      { label: '2 monitors', included: true },
      { label: '7-day history', included: true },
      { label: '8 global regions', included: true },
      { label: 'Email alerts', included: true },
      { label: 'Cache & TTFB analytics', included: true },
      { label: 'Slack & webhook', included: false },
      { label: 'Multiple recipients', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'per month',
    description: 'Full visibility for growing teams shipping to the edge.',
    cta: 'Start Pro',
    ctaHref: '/signup',
    highlighted: true,
    monitors: 20,
    historyDays: 30,
    features: [
      { label: '20 monitors', included: true },
      { label: '30-day history', included: true },
      { label: '8 global regions', included: true },
      { label: 'Email alerts', included: true },
      { label: 'Cache & TTFB analytics', included: true },
      { label: 'Slack & webhook', included: true },
      { label: 'Multiple recipients', included: false },
    ],
  },
  {
    name: 'Team',
    price: '$59',
    period: 'per month',
    description: 'Scale monitoring across your entire infrastructure.',
    cta: 'Start Team',
    ctaHref: '/signup',
    highlighted: false,
    monitors: 100,
    historyDays: 90,
    features: [
      { label: '100 monitors', included: true },
      { label: '90-day history', included: true },
      { label: '8 global regions', included: true },
      { label: 'Email alerts', included: true },
      { label: 'Cache & TTFB analytics', included: true },
      { label: 'Slack & webhook', included: true },
      { label: 'Multiple recipients', included: true },
    ],
  },
]

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--brand-primary)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
    </svg>
  )
}

function DashIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-700" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h8" />
    </svg>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background text-foreground">

      {/* Background glows */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80rem] h-[40rem] opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at top, var(--brand-primary) 0%, transparent 65%)' }}
      />

      {/* ═══════════════════════════════════════════════════════════ NAVBAR */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/96 backdrop-blur-md supports-[backdrop-filter]:bg-background/92">
        <div className="cs-container-adaptive flex items-center justify-between h-14">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo className="h-11" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm font-medium text-white transition-colors">
              Pricing
            </Link>
            <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="cs-btn-primary rounded-lg px-4 py-1.5 text-sm">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">

        {/* ═══════════════════════════════════════════════════════════ HERO */}
        <section className="cs-container-adaptive pt-20 pb-14 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--brand-primary)' }}>
            Pricing
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Simple, transparent pricing.
          </h1>
          <p className="mt-4 text-zinc-400 text-lg max-w-xl mx-auto">
            Start free, upgrade when you need more monitors or integrations. No hidden fees.
          </p>
        </section>

        {/* ═══════════════════════════════════════════════════════ PLAN CARDS */}
        <section className="cs-container-adaptive pb-28">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`cs-card cs-card-glass relative flex flex-col overflow-hidden transition-all duration-200 ${
                  plan.highlighted
                    ? '!border-[rgba(var(--brand-primary-rgb),0.35)] shadow-[0_0_40px_-8px_rgba(var(--brand-primary-rgb),0.12)]'
                    : ''
                }`}
              >
                <div className="cs-card-wash" aria-hidden />

                {plan.highlighted && (
                  <div className="absolute inset-x-0 top-0 z-20 flex justify-center">
                    <span
                      className="rounded-b-lg px-4 py-1 text-[10px] font-bold uppercase tracking-widest"
                      style={{ background: 'var(--brand-primary)', color: '#0B1220' }}
                    >
                      Most popular
                    </span>
                  </div>
                )}

                <div className={`relative z-10 flex flex-1 flex-col gap-6 p-7 ${plan.highlighted ? 'pt-9' : ''}`}>

                  {/* Plan header */}
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{plan.name}</p>
                    <div className="flex items-end gap-1.5">
                      <span className="text-4xl font-extrabold text-white tracking-tight">{plan.price}</span>
                      {plan.price !== '$0' && (
                        <span className="text-sm text-zinc-500 pb-1">{plan.period}</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{plan.description}</p>
                  </div>

                  {/* CTA */}
                  <Link
                    href={plan.ctaHref}
                    className={
                      plan.highlighted
                        ? 'cs-btn-primary rounded-lg px-5 py-2.5 text-center text-sm font-bold'
                        : 'inline-flex h-10 w-full items-center justify-center rounded-lg border border-white/5 bg-white/5 text-sm font-bold text-zinc-300 transition-all hover:border-emerald-500/25 hover:bg-emerald-500/[0.06] hover:text-emerald-300'
                    }
                  >
                    {plan.cta}
                  </Link>

                  <div className="border-t border-white/5" aria-hidden />

                  {/* Features */}
                  <ul className="space-y-3">
                    {plan.features.map((f) => (
                      <li key={f.label} className="flex items-center gap-3">
                        {f.included ? <CheckIcon /> : <DashIcon />}
                        <span className={`text-sm ${f.included ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom note */}
          <p className="mt-10 text-center text-xs text-zinc-600">
            All plans include 5-minute probe intervals across 8 independent global regions.
            <br />
            Need more than 100 monitors?{' '}
            <a href="mailto:hello@cachesnap.com" className="text-zinc-500 hover:text-zinc-300 underline transition-colors">
              Contact us.
            </a>
          </p>
        </section>

      </main>

      {/* ═══════════════════════════════════════════════════════════ FOOTER */}
      <footer className="relative z-10 border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="cs-container-adaptive py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <Logo className="h-8 opacity-70" />
              <span className="hidden sm:inline text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">Edge Performance Monitoring</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-zinc-500">
              <Link href="/login" className="hover:text-zinc-300 transition-colors">Sign in</Link>
              <Link href="/signup" className="hover:text-zinc-300 transition-colors">Sign up free</Link>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-600">© 2026 CacheSnap</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
