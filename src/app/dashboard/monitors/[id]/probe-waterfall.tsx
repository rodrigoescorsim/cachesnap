import { extractPop, popToCity } from '@/lib/edge-helpers'
import {
  breakdownColor,
  breakdownEntries,
  cacheClass,
  formatAge,
  pct,
} from './probe-waterfall.helpers'

export interface WaterfallProbe {
  region: string
  ttfb_ms: number | null
  download_ms: number | null
  total_ms: number | null
  edge_ms: number | null
  origin_ms: number | null
  redirect_count: number | null
  cache_status: string | null
  served_by: string | null
  age_s: number | null
  server_timing_breakdown: Record<string, number> | null
  probed_at: Date | null
}

const REGION_LABELS: Record<string, string> = {
  'sa-east': 'South America',
  'eu-west': 'Europe',
  'us-east': 'US East',
  'us-west': 'US West',
  'ap-east': 'Asia Pacific',
  'ap-south': 'India',
  'oc': 'Oceania',
  'af-south': 'Africa',
}

// ── segment palette (for legend + bars) ─────────────────────────────────────
const SEGS = {
  edge:     { bg: 'bg-blue-500',    label: 'Edge (CDN)' },
  origin:   { bg: 'bg-amber-400',   label: 'Origin' },
  ttfb:     { bg: 'bg-zinc-400',    label: 'TTFB (unattributed)' },
  download: { bg: 'bg-emerald-400', label: 'Download' },
} as const

// ── main component ───────────────────────────────────────────────────────────

export function ProbeWaterfall({ probes }: { probes: WaterfallProbe[] }) {
  if (probes.length === 0) return null

  // Scale: max total_ms across all regions (floor 100ms for readability)
  const maxTotal = Math.max(100, ...probes.map(p => p.total_ms ?? p.ttfb_ms ?? 0))

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Last probe — Timing breakdown
        </h2>
        {probes[0]?.probed_at && (
          <span className="text-[10px] text-zinc-400 tabular-nums">
            {new Date(probes[0].probed_at).toLocaleString('en-US', {
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5">
        {Object.values(SEGS).map(seg => (
          <span key={seg.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className={`h-2.5 w-2.5 rounded-sm ${seg.bg}`} />
            {seg.label}
          </span>
        ))}
        <span className="text-[10px] text-zinc-400 italic">
          (scale: {maxTotal}ms = 100%)
        </span>
      </div>

      <div className="space-y-3">
        {probes.map(probe => {
          const total   = probe.total_ms ?? probe.ttfb_ms ?? 0
          const ttfb    = probe.ttfb_ms ?? 0
          const download = probe.download_ms ?? Math.max(0, total - ttfb)
          const edge    = probe.edge_ms ?? 0
          const origin  = probe.origin_ms ?? 0

          // Portion of TTFB not explained by edge+origin Server-Timing entries
          const unknownTtfb = Math.max(0, ttfb - (edge + origin))
          const hasBreakdown = edge > 0 || origin > 0
          const hasServerTiming = breakdownEntries(probe.server_timing_breakdown).length > 0

          const pop = extractPop(probe.served_by)
          const regionLabel = REGION_LABELS[probe.region] ?? probe.region
          const age = formatAge(probe.age_s)
          const isZombie = probe.age_s != null && probe.age_s > 86_400

          return (
            <div
              key={probe.region}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden"
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 whitespace-nowrap">
                    {regionLabel}
                  </span>

                  {pop && (
                    <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200/50" title={pop}>
                      {popToCity(pop)}
                    </span>
                  )}

                  {probe.cache_status && (
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${cacheClass(probe.cache_status)}`}>
                      {probe.cache_status.toUpperCase()}
                    </span>
                  )}

                  {probe.redirect_count != null && probe.redirect_count > 0 && (
                    <span
                      className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-600"
                      title="Number of HTTP redirect hops followed before the final response"
                    >
                      {probe.redirect_count} hop{probe.redirect_count !== 1 ? 's' : ''}
                    </span>
                  )}

                  {age && (
                    <span
                      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${
                        isZombie
                          ? 'border-red-200 bg-red-50 text-red-600'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                      }`}
                      title={`Cache-Control Age: ${probe.age_s}s${isZombie ? ' — zombie cache detected' : ''}`}
                    >
                      Age {age}{isZombie ? ' ⚠' : ''}
                    </span>
                  )}
                </div>

                {/* Timing summary */}
                <div className="flex items-center gap-3 tabular-nums text-[10px] text-zinc-500 flex-wrap justify-end">
                  {edge > 0 && <span className="text-blue-600 font-medium">Edge {edge}ms</span>}
                  {origin > 0 && <span className="text-amber-600 font-medium">Origin {origin}ms</span>}
                  <span>
                    TTFB{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{ttfb}ms</span>
                  </span>
                  <span>
                    Total{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{total}ms</span>
                  </span>
                </div>
              </div>

              {/* ── Main waterfall bar ── */}
              <div className="px-3 pb-2">
                <div className="flex h-5 w-full rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {hasBreakdown ? (
                    <>
                      {edge > 0 && (
                        <div
                          className={`${SEGS.edge.bg} h-full shrink-0`}
                          style={{ width: pct(edge, maxTotal) }}
                          title={`Edge (CDN): ${edge}ms`}
                        />
                      )}
                      {origin > 0 && (
                        <div
                          className={`${SEGS.origin.bg} h-full shrink-0`}
                          style={{ width: pct(origin, maxTotal) }}
                          title={`Origin: ${origin}ms`}
                        />
                      )}
                      {unknownTtfb > 1 && (
                        <div
                          className={`${SEGS.ttfb.bg} h-full shrink-0`}
                          style={{ width: pct(unknownTtfb, maxTotal) }}
                          title={`Unattributed TTFB: ${Math.round(unknownTtfb)}ms`}
                        />
                      )}
                    </>
                  ) : (
                    ttfb > 0 && (
                      <div
                        className={`${SEGS.ttfb.bg} h-full shrink-0`}
                        style={{ width: pct(ttfb, maxTotal) }}
                        title={`TTFB: ${ttfb}ms (no Server-Timing breakdown available)`}
                      />
                    )
                  )}

                  {download > 0 && (
                    <div
                      className={`${SEGS.download.bg} h-full shrink-0`}
                      style={{ width: pct(download, maxTotal) }}
                      title={`Download (body): ${download}ms`}
                    />
                  )}
                </div>

                {/* Axis ticks */}
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-zinc-400">0</span>
                  <span className="text-[9px] text-zinc-400">{Math.round(maxTotal / 2)}ms</span>
                  <span className="text-[9px] text-zinc-400">{maxTotal}ms</span>
                </div>
              </div>

              {/* ── Server-Timing breakdown ── */}
              {hasServerTiming && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                    Server-Timing breakdown
                  </p>
                  <div className="space-y-1.5">
                    {breakdownEntries(probe.server_timing_breakdown).map(([name, ms]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span
                          className="w-[72px] shrink-0 text-[10px] font-mono text-zinc-500 truncate"
                          title={name}
                        >
                          {name}
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${breakdownColor(name)}`}
                            style={{ width: pct(ms, ttfb > 0 ? ttfb : maxTotal) }}
                          />
                        </div>
                        <span className="w-[40px] shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                          {ms}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── No Server-Timing note ── */}
              {!hasBreakdown && !hasServerTiming && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-2">
                  <span className="text-[10px] text-zinc-400">
                    No <code className="font-mono">Server-Timing</code> header —
                    edge/origin split unavailable.
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
