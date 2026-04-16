import { extractPop, popToCity, resolveCdnLabel } from '@/lib/edge-helpers'
import {
  breakdownColor,
  breakdownEntries,
  cacheClass,
  formatAge,
  pct,
} from './probe-waterfall.helpers'
import { TIMING } from './timing-metrics-palette'
import { TtfbLegendHelp } from './ttfb-legend-help'

export interface WaterfallProbe {
  region: string
  dns_ms: number | null
  tls_ms: number | null
  ttfb_ms: number | null
  download_ms: number | null
  total_ms: number | null
  edge_ms: number | null
  origin_ms: number | null
  redirect_count: number | null
  cache_status: string | null
  served_by: string | null
  cdn_provider: string | null
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

// ── segment palette (for legend + bars) — matches timing-metrics-palette ───
const SEGS = {
  dns:      { bg: TIMING.dns.bar,      label: 'DNS Lookup' },
  tcp:      { bg: TIMING.tcp.bar,      label: 'TCP Connect' },
  tls:      { bg: TIMING.tls.bar,      label: 'TLS Handshake' },
  edge:     { bg: TIMING.edge.bar,     label: 'Edge (CDN)' },
  origin:   { bg: TIMING.origin.bar,   label: 'Origin' },
  ttfb:     { bg: TIMING.ttfb.bar,     label: 'TTFB (unattributed)' },
  download: { bg: TIMING.download.bar, label: 'Download' },
} as const

// ── main component ───────────────────────────────────────────────────────────

export function ProbeWaterfall({ probes }: { probes: WaterfallProbe[] }) {
  if (probes.length === 0) return null

  // Scale: max total_ms across all regions (floor 100ms for readability)
  const maxTotal = Math.max(100, ...probes.map(p => p.total_ms ?? p.ttfb_ms ?? 0))

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
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
      <div className="mb-3">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {Object.entries(SEGS).map(([key, seg]) => {
            if (key === 'download') return null
            if (key === 'ttfb') {
              const dl = SEGS.download
              return (
                <span
                  key="ttfb-download"
                  className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-500 dark:text-zinc-400"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10 ${seg.bg}`} />
                  <span className="inline-flex items-center gap-0">
                    {seg.label}
                    <TtfbLegendHelp />
                  </span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10 ${dl.bg}`} />
                  {dl.label}
                </span>
              )
            }
            return (
              <span key={seg.label} className="flex items-center gap-1 text-[9px] font-medium text-zinc-500 dark:text-zinc-400">
                <span className={`h-2.5 w-2.5 shrink-0 rounded shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10 ${seg.bg}`} />
                {seg.label}
              </span>
            )
          })}
          <span className="flex h-2.5 items-center text-[9px] italic text-zinc-400">
            (scale: {maxTotal}ms = 100%)
          </span>
        </div>
      </div>

      <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-border bg-surface dark:divide-zinc-800">
        {probes.map(probe => {
          const total   = Number(probe.total_ms ?? probe.ttfb_ms ?? 0)
          const ttfb    = Number(probe.ttfb_ms ?? 0)
          const download = Number(probe.download_ms ?? Math.max(0, total - ttfb))
          const dns     = Number(probe.dns_ms ?? 0)
          const tls     = Number(probe.tls_ms ?? 0)
          const tcp     = Number(probe.server_timing_breakdown?.tcp_ms ?? 0)
          const edge    = Number(probe.edge_ms ?? 0)
          const origin  = Number(probe.origin_ms ?? 0)

          // Portion of TTFB not explained by DNS, TLS, edge+origin Server-Timing entries
          const unknownTtfb = Math.max(0, ttfb - (dns + tls + edge + origin))
          const hasBreakdown = dns > 0 || tls > 0 || edge > 0 || origin > 0
          const hasServerTiming = breakdownEntries(probe.server_timing_breakdown).length > 0

          const pop = extractPop(probe.served_by)
          const cdnLabel = resolveCdnLabel(probe.cdn_provider, probe.served_by)
          const regionLabel = REGION_LABELS[probe.region] ?? probe.region
          const age = formatAge(probe.age_s)
          const isZombie = probe.age_s != null && probe.age_s > 86_400

          return (
            <div
              key={probe.region}
              className="relative px-2.5 py-1.5 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
            >
              {/* ── Header ── */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="whitespace-nowrap text-xs font-semibold text-foreground">
                    {regionLabel}
                  </span>

                  {pop && (
                    <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 ring-1 ring-inset ring-white/10" title={pop}>
                      {popToCity(pop)}
                    </span>
                  )}

                  {cdnLabel && (
                    <span
                      className="inline-flex max-w-[8rem] items-center truncate rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium text-violet-300/90 ring-1 ring-inset ring-violet-500/20"
                      title={probe.served_by ? `served_by: ${probe.served_by}` : 'Edge provider'}
                    >
                      {cdnLabel}
                    </span>
                  )}

                  {probe.cache_status && (
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${cacheClass(probe.cache_status)}`}>
                      {probe.cache_status.toUpperCase()}
                    </span>
                  )}

                  {probe.redirect_count != null && probe.redirect_count > 0 && (
                    <span
                      className="inline-flex items-center rounded-md border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-400"
                      title="Number of HTTP redirect hops followed before the final response"
                    >
                      {probe.redirect_count} hop{probe.redirect_count !== 1 ? 's' : ''}
                    </span>
                  )}

                  {age && (
                    <span
                      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${
                        isZombie
                          ? 'border-red-500/20 bg-red-500/5 text-red-400'
                          : 'border-border bg-white/5 text-zinc-500'
                      }`}
                      title={`Cache-Control Age: ${probe.age_s}s${isZombie ? ' — zombie cache detected' : ''}`}
                    >
                      Age {age}{isZombie ? ' ⚠' : ''}
                    </span>
                  )}
                </div>

                {/* Timing summary */}
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 tabular-nums text-[9px] text-zinc-500">
                  {dns > 0 && <span>DNS <span className={`font-medium ${TIMING.dns.text}`}>{Math.round(dns)}ms</span></span>}
                  {tcp > 0 && <span>TCP <span className={`font-medium ${TIMING.tcp.text}`}>{Math.round(tcp)}ms</span></span>}
                  {tls > 0 && <span>TLS <span className={`font-medium ${TIMING.tls.text}`}>{Math.round(tls)}ms</span></span>}
                  {edge > 0 && <span className={`font-medium ${TIMING.edge.text}`}>Edge {edge}ms</span>}
                  {origin > 0 && <span className={`font-medium ${TIMING.origin.text}`}>Origin {origin}ms</span>}
                  <span>
                    TTFB{' '}
                    <span className={`font-semibold ${TIMING.ttfb.text}`}>{ttfb}ms</span>
                  </span>
                  <span>
                    Total{' '}
                    <span className={`font-semibold ${TIMING.total.text}`}>{total}ms</span>
                  </span>
                </div>
              </div>

              {/* ── Main waterfall bar ── */}
              <div className="mt-1.5">
                <div className="flex h-3.5 w-full overflow-hidden rounded bg-background/50">
                  {hasBreakdown ? (
                    <>
                      {dns > 0 && (
                        <div
                          className={`${SEGS.dns.bg} h-full shrink-0`}
                          style={{ width: pct(dns, maxTotal) }}
                          title={`DNS Lookup: ${dns}ms`}
                        />
                      )}
                      {tcp > 0 && (
                        <div
                          className={`${SEGS.tcp.bg} h-full shrink-0`}
                          style={{ width: pct(tcp, maxTotal) }}
                          title={`TCP Connect: ${tcp}ms`}
                        />
                      )}
                      {tls > 0 && (
                        <div
                          className={`${SEGS.tls.bg} h-full shrink-0`}
                          style={{ width: pct(tls, maxTotal) }}
                          title={`TLS Handshake: ${tls}ms`}
                        />
                      )}
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
                <div className="mt-px flex justify-between leading-none">
                  <span className="text-[8px] text-zinc-400">0</span>
                  <span className="text-[8px] text-zinc-400">{Math.round(maxTotal / 2)}ms</span>
                  <span className="text-[8px] text-zinc-400">{maxTotal}ms</span>
                </div>
              </div>

              {(() => {
                const showDetailBlocks =
                  hasServerTiming ||
                  dns > 0 ||
                  tls > 0 ||
                  tcp > 0 ||
                  (!hasBreakdown && !hasServerTiming)
                if (!showDetailBlocks) return null

                return (
                  <details className="group mt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 pl-0 pr-0.5 text-[8px] font-semibold uppercase tracking-wider text-zinc-400 leading-tight hover:text-zinc-500 dark:hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                      <span>Additional timing breakdowns</span>
                      <span className="text-zinc-500 transition-transform group-open:rotate-180" aria-hidden>
                        ▼
                      </span>
                    </summary>
                    <div className="space-y-0 pb-1">
                      {hasServerTiming && (
                        <div className="py-1.5">
                          <p className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-400">
                            Server-Timing breakdown
                          </p>
                          <div className="space-y-1">
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

                      {(dns > 0 || tls > 0 || tcp > 0) && (
                        <div
                          className={`bg-zinc-50/50 py-1.5 dark:bg-zinc-950/20 ${hasServerTiming ? 'border-t border-zinc-100 dark:border-zinc-800' : ''}`}
                        >
                          <p className="mb-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-400">
                            Network layer timing
                          </p>
                          <div className="space-y-1">
                            {dns > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-[72px] shrink-0 text-[10px] font-mono text-zinc-500 truncate" title="DNS Lookup">
                                  dns
                                </span>
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${TIMING.dns.barFill}`}
                                    style={{ width: pct(dns, Math.max(dns, ttfb > 0 ? ttfb : maxTotal)) }}
                                  />
                                </div>
                                <span className="w-[40px] shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                                  {Math.round(dns)}ms
                                </span>
                              </div>
                            )}
                            {tcp > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-[72px] shrink-0 text-[10px] font-mono text-zinc-500 truncate" title="TCP Connect">
                                  tcp
                                </span>
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${TIMING.tcp.barFill}`}
                                    style={{ width: pct(tcp, Math.max(tcp, ttfb > 0 ? ttfb : maxTotal)) }}
                                  />
                                </div>
                                <span className="w-[40px] shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                                  {Math.round(tcp)}ms
                                </span>
                              </div>
                            )}
                            {tls > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-[72px] shrink-0 text-[10px] font-mono text-zinc-500 truncate" title="TLS Handshake">
                                  tls
                                </span>
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${TIMING.tls.barFill}`}
                                    style={{ width: pct(tls, Math.max(tls, ttfb > 0 ? ttfb : maxTotal)) }}
                                  />
                                </div>
                                <span className="w-[40px] shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                                  {Math.round(tls)}ms
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {!hasBreakdown && !hasServerTiming && (
                        <div className={`py-1.5 ${hasServerTiming || dns > 0 || tls > 0 || tcp > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''}`}>
                          <span className="text-[9px] text-zinc-400">
                            No <code className="font-mono">Server-Timing</code> header —
                            edge/origin split unavailable.
                          </span>
                        </div>
                      )}
                    </div>
                  </details>
                )
              })()}
            </div>
          )
        })}
      </div>
    </section>
  )
}
