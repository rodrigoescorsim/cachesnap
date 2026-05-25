import { MarketingFooter, MarketingHeader } from '@/components/marketing/marketing-chrome'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How CacheSnap collects, uses, and protects your data.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy — CacheSnap',
    description: 'How CacheSnap collects, uses, and protects your data.',
    url: '/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <div className="cs-container-adaptive max-w-3xl py-24">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--brand-primary)' }}>
            Legal
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-zinc-500 mb-12">Last updated: May 25, 2026</p>

          <div className="prose-legal">

            <Section title="1. Overview">
              <p>
                CacheSnap (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is an edge monitoring platform. This policy explains what
                personal data we collect, the legal basis for processing it, how we use it, and your rights under the
                Brazilian General Data Protection Law (LGPD — Lei nº 13.709/2018).
              </p>
              <p>
                Questions about this policy? Contact our Data Protection Officer at{' '}
                <a href="mailto:hello@cachesnap.com">hello@cachesnap.com</a>.
              </p>
            </Section>

            <Section title="2. Data Controller">
              <p>
                CacheSnap is the data controller responsible for your personal data. Contact:{' '}
                <a href="mailto:hello@cachesnap.com">hello@cachesnap.com</a>.
              </p>
            </Section>

            <Section title="3. Data We Collect">
              <Subsection title="Account data">
                Name, email address, and password (hashed) when you create an account. If you sign in with Google,
                we receive your name and email from Google OAuth.
              </Subsection>
              <Subsection title="Monitor configuration">
                URLs and alert settings you add to be monitored. Processed solely to deliver the service.
              </Subsection>
              <Subsection title="Performance data">
                TTFB measurements, cache status, and latency collected by our global probes for your configured monitors.
              </Subsection>
              <Subsection title="Usage data">
                Pages visited, features used, and interactions within the dashboard — used to improve the product.
              </Subsection>
              <Subsection title="Billing data">
                Payment is processed by Stripe. We do not store credit card numbers. We receive only payment status
                and subscription tier from Stripe.
              </Subsection>
              <Subsection title="Technical data">
                IP address, browser type, and device information collected automatically for security and
                fraud prevention purposes.
              </Subsection>
            </Section>

            <Section title="4. Legal Basis for Processing (LGPD Art. 7)">
              <p>We process your personal data under the following legal bases:</p>
              <ul>
                <li>
                  <strong>Contract execution</strong> — processing necessary to provide the monitoring service
                  you signed up for (account data, monitor configuration, performance data).
                </li>
                <li>
                  <strong>Legitimate interest</strong> — usage data and technical data to improve the product,
                  detect abuse, and ensure security.
                </li>
                <li>
                  <strong>Legal obligation</strong> — data retained to comply with applicable laws and
                  respond to lawful requests.
                </li>
                <li>
                  <strong>Consent</strong> — marketing communications, if you opt in. You may withdraw
                  consent at any time.
                </li>
              </ul>
            </Section>

            <Section title="5. How We Use Your Data">
              <ul>
                <li>To provide, operate, and improve CacheSnap.</li>
                <li>To send alerts and notifications you configured.</li>
                <li>To process payments and manage your subscription.</li>
                <li>To respond to support requests.</li>
                <li>To detect and prevent fraud or abuse.</li>
                <li>To comply with legal obligations.</li>
              </ul>
              <p>We do not sell your personal data to third parties.</p>
            </Section>

            <Section title="6. Data Retention">
              <p>
                Performance metrics are retained according to your plan: 7 days (Free), 30 days (Pro), or 90 days (Team).
                Account data is retained while your account is active. Upon account closure, personal data is deleted
                within 30 days, except where retention is required by law.
              </p>
            </Section>

            <Section title="7. Third-Party Sub-Processors">
              <p>We share data with the following sub-processors solely to operate the service:</p>
              <ul>
                <li><strong>Amazon Web Services (AWS)</strong> — infrastructure, database, and probe execution.</li>
                <li><strong>Stripe</strong> — payment processing.</li>
                <li><strong>Resend</strong> — transactional email delivery.</li>
              </ul>
              <p>Each provider is contractually bound to protect your data in accordance with applicable law.</p>
            </Section>

            <Section title="8. International Data Transfers">
              <p>
                Our sub-processors (AWS, Stripe, Resend) are based in the United States. By using CacheSnap, you
                acknowledge that your data may be transferred to and processed in countries outside Brazil. Such
                transfers occur under appropriate safeguards, including Standard Contractual Clauses or equivalent
                mechanisms recognized under LGPD Art. 33.
              </p>
            </Section>

            <Section title="9. Cookies">
              <p>
                We use session cookies strictly necessary for authentication. We do not use third-party advertising
                cookies, tracking pixels, or behavioral profiling tools.
              </p>
            </Section>

            <Section title="10. Your Rights (LGPD Art. 18)">
              <p>Under Brazilian law, you have the right to:</p>
              <ul>
                <li>Confirm whether we process your personal data.</li>
                <li>Access your personal data.</li>
                <li>Correct incomplete or inaccurate data.</li>
                <li>Request anonymization, blocking, or deletion of unnecessary data.</li>
                <li>Request data portability to another service provider.</li>
                <li>Request deletion of data processed with your consent.</li>
                <li>Obtain information about third parties with whom we share your data.</li>
                <li>Revoke consent at any time.</li>
                <li>Lodge a complaint with the Brazilian National Data Protection Authority (ANPD).</li>
              </ul>
              <p>
                To exercise any of these rights, email{' '}
                <a href="mailto:hello@cachesnap.com">hello@cachesnap.com</a>. We respond within 15 business days.
              </p>
            </Section>

            <Section title="11. Security">
              <p>
                We use encryption in transit (TLS 1.2+) and at rest. Access to production systems is restricted,
                authenticated, and audited. In the event of a data breach affecting your rights, we will notify
                you and the ANPD within the timeframes required by law.
              </p>
            </Section>

            <Section title="12. Children">
              <p>
                CacheSnap is not directed at individuals under 18 years of age. We do not knowingly collect
                personal data from minors. If you believe a minor has provided us data, contact us for immediate deletion.
              </p>
            </Section>

            <Section title="13. Changes to This Policy">
              <p>
                We may update this policy. Material changes will be communicated by email or dashboard notice at
                least 15 days before taking effect. The date at the top of this page always reflects the latest revision.
              </p>
            </Section>

            <Section title="14. Contact & DPO">
              <p>
                Data Protection Officer: <a href="mailto:hello@cachesnap.com">hello@cachesnap.com</a>
                <br />
                National Data Protection Authority (ANPD): <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">gov.br/anpd</a>
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

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p><span className="text-zinc-300 font-medium">{title}: </span>{children}</p>
    </div>
  )
}
