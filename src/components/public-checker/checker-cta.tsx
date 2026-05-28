import Link from 'next/link'

export function CheckerCta() {
  return (
    <div className="cs-card overflow-hidden px-6 py-8 text-center">
      <div className="cs-card-wash" />
      <p className="relative z-10 mb-1 text-[11px] font-black uppercase tracking-widest text-zinc-500">
        Want continuous monitoring?
      </p>
      <p className="relative z-10 mb-5 text-xl font-black text-zinc-100">
        Get alerts when your CDN cache breaks.
      </p>
      <p className="relative z-10 mb-6 text-sm text-zinc-500">
        CacheSnap monitors your URLs from 8 global regions 24/7 — instant alerts on cache misses, TTFB spikes, and CDN outages.
      </p>
      <div className="relative z-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/signup" className="cs-btn-primary px-8 py-2.5 text-sm">
          Start monitoring free
        </Link>
        <Link
          href="/pricing"
          className="text-[12px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
        >
          See plans →
        </Link>
      </div>
    </div>
  )
}
