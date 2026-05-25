import { MarketingFooter, MarketingHeader } from '@/components/marketing/marketing-chrome'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms and conditions for using CacheSnap.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service — CacheSnap',
    description: 'Terms and conditions for using CacheSnap.',
    url: '/terms',
  },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <div className="cs-container-adaptive max-w-3xl py-24">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--brand-primary)' }}>
            Legal
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-zinc-500 mb-12">Last updated: May 25, 2026</p>

          <div className="prose-legal">

            <Section title="1. Acceptance">
              <p>
                By creating an account or using CacheSnap (&quot;Service&quot;), you agree to these Terms of Service
                (&quot;Terms&quot;). If you do not agree, do not use the Service. These Terms constitute a legally binding
                agreement between you and CacheSnap.
              </p>
            </Section>

            <Section title="2. Description of Service">
              <p>
                CacheSnap is an edge monitoring platform that measures TTFB and CDN cache performance from multiple
                global regions. The Service includes a monitoring dashboard, alerting system, and performance
                reporting tools. We reserve the right to modify, suspend, or discontinue any part of the Service
                at any time with reasonable notice.
              </p>
            </Section>

            <Section title="3. Accounts">
              <ul>
                <li>You must provide accurate, current, and complete information when creating an account.</li>
                <li>You are responsible for maintaining the confidentiality of your credentials and for all
                    activity that occurs under your account.</li>
                <li>You must be at least 18 years old to use the Service.</li>
                <li>One person or legal entity may not maintain more than one free account.</li>
                <li>You must notify us immediately of any unauthorized use of your account at{' '}
                    <a href="mailto:hello@cachesnap.com">hello@cachesnap.com</a>.</li>
              </ul>
            </Section>

            <Section title="4. Acceptable Use">
              <p>You agree not to:</p>
              <ul>
                <li>Monitor URLs or systems you do not own or have explicit authorization to monitor.</li>
                <li>Use the Service to conduct denial-of-service attacks or intentionally generate excessive load
                    on monitored targets.</li>
                <li>Attempt to probe, scan, or test the vulnerability of the Service or its infrastructure.</li>
                <li>Reverse engineer, decompile, or extract source code from the Service.</li>
                <li>Resell, sublicense, or redistribute the Service without our written consent.</li>
                <li>Use the Service for any unlawful purpose or in violation of any applicable regulations.</li>
              </ul>
              <p>
                Violation of these rules may result in immediate account suspension or termination without prior notice
                or refund.
              </p>
            </Section>

            <Section title="5. Plans and Payment">
              <ul>
                <li>The Free plan is provided at no cost and may have feature or usage limitations.</li>
                <li>Paid plans (Pro, Team) are billed monthly via Stripe. Pricing is displayed at{' '}
                    <a href="/pricing">cachesnap.com/pricing</a>.</li>
                <li>Upgrades take effect immediately. Downgrades take effect at the start of the next billing cycle.</li>
                <li>All fees are non-refundable except where required by applicable law (including Brazilian
                    Consumer Protection Code, where applicable).</li>
                <li>We reserve the right to change pricing with at least 30 days advance notice. Continued use
                    after a price change constitutes acceptance of the new pricing.</li>
                <li>Failed payments may result in service suspension until the outstanding balance is resolved.</li>
              </ul>
            </Section>

            <Section title="6. Service Availability">
              <p>
                We aim for high availability but do not guarantee uninterrupted or error-free service. The Service
                is provided <strong>&quot;as is&quot; and &quot;as available&quot;</strong>, without warranty of any kind,
                express or implied, including but not limited to warranties of merchantability, fitness for a
                particular purpose, or non-infringement. Scheduled maintenance will be communicated in advance
                when possible.
              </p>
            </Section>

            <Section title="7. Data and Privacy">
              <p>
                Our collection and use of your personal data is governed by our{' '}
                <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.
                By using the Service, you consent to the data practices described therein.
              </p>
            </Section>

            <Section title="8. Intellectual Property">
              <p>
                CacheSnap, its logo, and all related technology, content, and features are the exclusive property
                of CacheSnap and are protected by applicable intellectual property laws. Nothing in these Terms
                grants you any rights to our trademarks or proprietary technology.
              </p>
              <p>
                You retain full ownership of the URLs, configurations, and data you provide to the Service.
                By using the Service, you grant us a limited license to process that data solely to deliver
                the monitoring service.
              </p>
            </Section>

            <Section title="9. Termination">
              <ul>
                <li>You may cancel your account at any time from the dashboard settings.</li>
                <li>Upon cancellation, your account remains active until the end of the current billing period.</li>
                <li>We may suspend or terminate your account for violation of these Terms, with or without notice.</li>
                <li>Upon termination, your personal data will be deleted within 30 days, except where retention
                    is required by law.</li>
              </ul>
            </Section>

            <Section title="10. Limitation of Liability">
              <p>
                To the maximum extent permitted by applicable law, CacheSnap shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages, including loss of profits, data, goodwill,
                or business interruption, arising from your use of or inability to use the Service.
              </p>
              <p>
                Our total cumulative liability for any claim arising out of or related to these Terms or the Service
                shall not exceed the total amount paid by you to CacheSnap in the three (3) months immediately
                preceding the event giving rise to the claim.
              </p>
            </Section>

            <Section title="11. Indemnification">
              <p>
                You agree to defend, indemnify, and hold harmless CacheSnap and its affiliates, officers, and
                employees from any claims, damages, losses, or expenses (including reasonable legal fees) arising
                from: (a) your use of the Service in violation of these Terms; (b) your violation of any applicable
                law or regulation; or (c) your infringement of any third-party rights.
              </p>
            </Section>

            <Section title="12. Governing Law and Disputes">
              <p>
                These Terms are governed by the laws of the Federative Republic of Brazil. Any disputes arising
                from or relating to these Terms or the Service shall be submitted to the exclusive jurisdiction
                of the courts of Brazil, without regard to conflict of law principles.
              </p>
            </Section>

            <Section title="13. Changes to Terms">
              <p>
                We may update these Terms at any time. We will notify you by email or dashboard notice at least
                15 days before material changes take effect. Your continued use of the Service after the effective
                date constitutes acceptance of the revised Terms. If you do not agree to the changes, you must
                stop using the Service before the effective date.
              </p>
            </Section>

            <Section title="14. Miscellaneous">
              <ul>
                <li><strong>Entire agreement.</strong> These Terms, together with the Privacy Policy, constitute
                    the entire agreement between you and CacheSnap regarding the Service.</li>
                <li><strong>Severability.</strong> If any provision of these Terms is found unenforceable, the
                    remaining provisions continue in full force.</li>
                <li><strong>No waiver.</strong> Failure to enforce any right under these Terms does not constitute
                    a waiver of that right.</li>
                <li><strong>Assignment.</strong> You may not assign these Terms without our prior written consent.
                    We may assign them without restriction.</li>
              </ul>
            </Section>

            <Section title="15. Contact">
              <p>
                Questions about these Terms? Contact us at{' '}
                <a href="mailto:hello@cachesnap.com">hello@cachesnap.com</a>.
              </p>
            </Section>

          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
      <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">{children}</div>
    </section>
  )
}
