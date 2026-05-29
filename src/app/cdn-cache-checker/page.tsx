import type { Metadata } from 'next'
import Link from 'next/link'
import { Globe, Zap, Shield } from 'lucide-react'
import { MarketingHeader, MarketingFooter } from '@/components/marketing/marketing-chrome'
import { CheckerForm } from '@/components/public-checker/checker-form'
import { CheckerCta } from '@/components/public-checker/checker-cta'

export const metadata: Metadata = {
  title: 'Free CDN Cache Checker — Test from 8 Global Regions | CacheSnap',
  description:
    'Check CDN cache status, hit rate, TTFB, and full timing breakdown from 8 global regions. No signup required.',
  alternates: { canonical: '/cdn-cache-checker' },
  openGraph: {
    title: 'Free CDN Cache Checker | CacheSnap',
    description:
      'Check CDN cache status, hit rate, TTFB, and full timing breakdown from 8 global regions. No signup required.',
    url: '/cdn-cache-checker',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'CDN Cache Checker',
  url: 'https://cachesnap.com/cdn-cache-checker',
  applicationCategory: 'DeveloperTool',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description:
    'Check CDN cache headers, hit rate, and TTFB from 8 global regions. Free, no signup.',
}

const HOW_IT_WORKS = [
  {
    icon: Globe,
    title: 'Paste your URL',
    description: 'Enter any public URL — a CDN asset, API endpoint, or page.',
  },
  {
    icon: Zap,
    title: 'Probes fire in parallel',
    description: 'CacheSnap dispatches probes from 8 AWS Lambda regions simultaneously.',
  },
  {
    icon: Shield,
    title: 'See cache + TTFB per region',
    description: 'Results stream in with cache status, CDN provider, TTFB, and security headers.',
  },
]

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingHeader activeNav="cdn-cache-checker" />

      <main className="pt-24 pb-24">
        {/* Hero */}
        <section className="cs-container-adaptive">
          <div className="mx-auto max-w-2xl text-center mb-10">
            <div className="mb-4 flex items-center justify-center gap-2">
              <span className="cs-badge cs-badge-success">Free</span>
              <span className="cs-badge cs-badge-muted">No signup</span>
              <span className="cs-badge cs-badge-muted">8 regions</span>
            </div>
            <h1 className="mb-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              CDN Cache Checker
            </h1>
            <p className="text-lg text-zinc-400">
              Instantly check cache status, hit rate, TTFB, and timing breakdown from 8 global regions.
            </p>
          </div>

          <div className="mx-auto w-full max-w-4xl px-1 sm:px-0">
            <CheckerForm />
          </div>
        </section>

        {/* How it works */}
        <section className="cs-container-adaptive mt-20">
          <h2 className="mb-8 text-center text-[11px] font-black uppercase tracking-widest text-zinc-500">
            How it works
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="cs-card px-6 py-6">
                <div className="cs-card-wash" />
                <div className="relative z-10 mb-4 cs-icon-well-md">
                  <step.icon className="h-5 w-5" />
                </div>
                <p className="relative z-10 mb-1 text-sm font-bold text-zinc-100">
                  {step.title}
                </p>
                <p className="relative z-10 text-[13px] text-zinc-500">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* What we check */}
        <section className="cs-container-adaptive mt-16">
          <div className="cs-card px-6 py-6">
            <div className="cs-card-wash" />
            <h2 className="relative z-10 mb-4 text-[11px] font-black uppercase tracking-widest text-zinc-500">
              What each check reports
            </h2>
            <div className="relative z-10 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {[
                ['Cache Status', 'HIT, MISS, BYPASS, EXPIRED, STALE'],
                ['TTFB', 'Time to first byte per region'],
                ['CDN Provider', 'Cloudflare, Fastly, CloudFront, and more'],
                ['HTTP Status', 'Response status code'],
                ['Age', 'Seconds since the object was cached'],
                ['Cache-Control', 'Raw directives from the response'],
                ['Security Score', 'HSTS and security header presence'],
                ['Served By', 'Edge node / PoP identifier'],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-2 py-1.5 text-[13px] border-b border-border/30 last:border-0">
                  <span className="font-semibold text-zinc-300 min-w-[120px]">{label}</span>
                  <span className="text-zinc-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="cs-container-adaptive mt-16">
          <h2 className="mb-6 text-[11px] font-black uppercase tracking-widest text-zinc-500">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: 'Is this tool really free?',
                a: 'Yes. No account needed, no credit card. You can run up to 10 checks per hour.',
              },
              {
                q: 'What CDNs does it detect?',
                a: 'Cloudflare, Fastly, AWS CloudFront, Akamai, Vercel, Netlify, and any CDN that sets standard cache headers.',
              },
              {
                q: "Why does one region show MISS while others show HIT?",
                a: "CDN caches are regional. A MISS in one region means that edge hasn't cached the object yet — this is common right after a purge or for low-traffic assets.",
              },
              {
                q: 'What is the rate limit?',
                a: '1 check every 60 seconds, up to 10 per hour per IP. For continuous monitoring, create a free account.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="cs-card px-5 py-4">
                <div className="cs-card-wash" />
                <p className="relative z-10 mb-1.5 text-sm font-bold text-zinc-200">{q}</p>
                <p className="relative z-10 text-[13px] text-zinc-500">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="cs-container-adaptive mt-16">
          <CheckerCta />
        </section>
      </main>

      <MarketingFooter />
    </>
  )
}
