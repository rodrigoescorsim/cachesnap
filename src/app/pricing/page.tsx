import Link from 'next/link'
import { MarketingFooter, MarketingHeader } from '@/components/marketing/marketing-chrome'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Start monitoring CDN cache performance for free. 8 global regions, TTFB analytics, and intelligent alerts. Pro from $19/mo — no credit card required.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing — CacheSnap',
    description:
      'Start monitoring CDN cache performance for free. 8 global regions, TTFB analytics, and intelligent alerts. Pro from $19/mo — no credit card required.',
    url: '/pricing',
  },
}

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
    ],
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'per month',
    description: 'Full visibility for growing teams shipping to the edge.',
    cta: 'Start Pro',
    ctaHref: '/signup?plan=pro',
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
    ],
  },
  {
    name: 'Team',
    price: '$59',
    period: 'per month',
    description: 'Scale monitoring across your entire infrastructure.',
    cta: 'Start Team',
    ctaHref: '/signup?plan=team',
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

      <MarketingHeader activeNav="pricing" />

      <main id="main-content" className="flex-1 relative z-10">

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
                  plan.highlighted ? 'cs-card-highlight' : ''
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
                        : 'cs-btn-secondary-lg text-center'
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

      <MarketingFooter />

    </div>
  )
}
