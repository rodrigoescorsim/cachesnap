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
import { PremiumTooltip } from '@/components/premium-tooltip'

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

// ── segment palette (for legend + bars) — matches timing-metrics-palette ───
const SEGS = {
  dns: { bg: TIMING.dns.bar, label: 'DNS' },
  tcp: { bg: TIMING.tcp.bar, label: 'TCP' },
  tls: { bg: TIMING.tls.bar, label: 'TLS' },
  edge: { bg: TIMING.edge.bar, label: 'Edge' },
  origin: { bg: TIMING.origin.bar, label: 'Origin' },
  ttfb: { bg: TIMING.ttfb.bar, label: 'TTFB (unattributed)' },
  download: { bg: TIMING.download.bar, label: 'Download' },
} as const

// ── helpers ─────────────────────────────────────────────────────────────────

function formatMs(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value)}ms`
}

// ── main component ───────────────────────────────────────────────────────────

export function WaterfallLegend({ maxTotal }: { maxTotal: number }) {
  return (
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
  )
}

export function ProbeWaterfall({
  probes,
  regionLabels,
  hideHeader = false,
  hideLegend = false
}: {
  probes: WaterfallProbe[];
  regionLabels: Record<string, string>;
  hideHeader?: boolean;
  hideLegend?: boolean;
}) {
  if (probes.length === 0) return null

  // Scale: max total_ms across all regions (floor 100ms for readability)
  const maxTotal = Math.max(100, ...probes.map(p => p.total_ms ?? p.ttfb_ms ?? 0))

  return (
    <section>
      {!hideHeader && (
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
      )}

      {/* Legend - only show if not in embedded/compact mode */}
      {!hideHeader && !hideLegend && <WaterfallLegend maxTotal={maxTotal} />}

      <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-border bg-surface dark:divide-zinc-800">
        {probes.map(probe => {
          const total = Number(probe.total_ms ?? probe.ttfb_ms ?? 0)
          const ttfb = Number(probe.ttfb_ms ?? 0)
          const download = Math.max(0, total - ttfb)
          const dns = Number(probe.dns_ms ?? 0)
          const tls = Number(probe.tls_ms ?? 0)
          const tcp = Number(probe.server_timing_breakdown?.tcp_ms ?? 0)
          const edge = Number(probe.edge_ms ?? 0)
          const origin = Number(probe.origin_ms ?? 0)

          // Portion of TTFB not explained by DNS, TLS, edge+origin Server-Timing entries
          const attributedTtfb = dns + tls + tcp + edge + origin
          const unknownTtfb = Math.max(0, ttfb - attributedTtfb)
          const hasBreakdown = dns > 0 || tls > 0 || edge > 0 || origin > 0
          const hasServerTiming = breakdownEntries(probe.server_timing_breakdown).length > 0

          const pop = extractPop(probe.served_by)
          const cdnLabel = resolveCdnLabel(probe.cdn_provider, probe.served_by)
          const regionLabel = regionLabels[probe.region] ?? probe.region
          const age = formatAge(probe.age_s)
          const isZombie = probe.age_s != null && probe.age_s > 86_400

          return (
            <div
              key={probe.region}
              className="relative p-3 transition-colors"
            >
              {/* ── Header ── */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                {!hideHeader && (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="whitespace-nowrap text-xs font-semibold text-foreground">
                      {regionLabel}
                    </span>

                    {pop && (
                      <PremiumTooltip content={pop}>
                        <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-inset ring-white/10">
                          {popToCity(pop)}
                        </span>
                      </PremiumTooltip>
                    )}

                    {cdnLabel && (
                      <PremiumTooltip content={probe.served_by ? `served_by: ${probe.served_by}` : 'Edge provider'}>
                        <span
                          className="inline-flex max-w-[8rem] items-center truncate rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300/90 ring-1 ring-inset ring-violet-500/20"
                        >
                          {cdnLabel}
                        </span>
                      </PremiumTooltip>
                    )}

                    {probe.cache_status && (
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${cacheClass(probe.cache_status)}`}>
                        {probe.cache_status.toUpperCase()}
                      </span>
                    )}

                    {probe.redirect_count != null && probe.redirect_count > 0 && (
                      <PremiumTooltip content="Number of HTTP redirect hops followed before the final response">
                        <span
                          className="inline-flex items-center rounded-md border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400"
                        >
                          {probe.redirect_count} hop{probe.redirect_count !== 1 ? 's' : ''}
                        </span>
                      </PremiumTooltip>
                    )}

                    {age && (
                      <PremiumTooltip content={`Cache-Control Age: ${probe.age_s}s${isZombie ? ' — zombie cache detected' : ''}`}>
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${isZombie
                            ? 'border-red-500/20 bg-red-500/5 text-red-400'
                            : 'border-border bg-white/5 text-zinc-500'
                            }`}
                        >
                          Age {age}{isZombie ? ' ⚠' : ''}
                        </span>
                      </PremiumTooltip>
                    )}
                  </div>
                )}

                {/* Unified Timing Legend & Summary */}
                <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 tabular-nums text-[10px] text-zinc-400">
                  {dns > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.dns.bg}`} />
                      {SEGS.dns.label} <span className={`font-bold ${TIMING.dns.text}`}>{formatMs(dns)}</span>
                    </span>
                  )}
                  {tcp > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.tcp.bg}`} />
                      {SEGS.tcp.label} <span className={`font-bold ${TIMING.tcp.text}`}>{formatMs(tcp)}</span>
                    </span>
                  )}
                  {tls > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.tls.bg}`} />
                      {SEGS.tls.label} <span className={`font-bold ${TIMING.tls.text}`}>{formatMs(tls)}</span>
                    </span>
                  )}
                  {edge > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.edge.bg}`} />
                      {SEGS.edge.label} <span className={`font-bold ${TIMING.edge.text}`}>{formatMs(edge)}</span>
                    </span>
                  )}
                  {origin > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.origin.bg}`} />
                      {SEGS.origin.label} <span className={`font-bold ${TIMING.origin.text}`}>{formatMs(origin)}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.ttfb.bg}`} />
                    <span className="inline-flex items-center gap-0.5">
                      {SEGS.ttfb.label}
                      <TtfbLegendHelp />
                    </span>
                    <span className={`font-bold ${TIMING.ttfb.text}`}>{formatMs(ttfb)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SEGS.download.bg}`} />
                    {SEGS.download.label} <span className={`font-bold ${TIMING.download.text}`}>{formatMs(download)}</span>
                  </span>
                  <span className="ml-2 pl-4 border-l border-white/10 text-zinc-500 font-medium">
                    Total <span className="text-zinc-200 font-black">{formatMs(total)}</span>
                  </span>
                </div>
              </div>

              {/* ── Main waterfall bar ── */}
              <div className="mt-2">
                <div className="flex h-3.5 w-full overflow-hidden rounded bg-background/50">
                  {hasBreakdown ? (
                    <>
                      {dns > 0 && (
                        <PremiumTooltip 
                          content={`DNS: ${formatMs(dns)}`}
                          className="h-full shrink-0"
                          style={{ width: pct(dns, maxTotal) }}
                        >
                          <div className={`${SEGS.dns.bg} h-full w-full`} />
                        </PremiumTooltip>
                      )}
                      {tcp > 0 && (
                        <PremiumTooltip 
                          content={`TCP: ${formatMs(tcp)}`}
                          className="h-full shrink-0"
                          style={{ width: pct(tcp, maxTotal) }}
                        >
                          <div className={`${SEGS.tcp.bg} h-full w-full`} />
                        </PremiumTooltip>
                      )}
                      {tls > 0 && (
                        <PremiumTooltip 
                          content={`TLS: ${formatMs(tls)}`}
                          className="h-full shrink-0"
                          style={{ width: pct(tls, maxTotal) }}
                        >
                          <div className={`${SEGS.tls.bg} h-full w-full`} />
                        </PremiumTooltip>
                      )}
                      {edge > 0 && (
                        <PremiumTooltip 
                          content={`Edge: ${formatMs(edge)}`}
                          className="h-full shrink-0"
                          style={{ width: pct(edge, maxTotal) }}
                        >
                          <div className={`${SEGS.edge.bg} h-full w-full`} />
                        </PremiumTooltip>
                      )}
                      {origin > 0 && (
                        <PremiumTooltip 
                          content={`Origin: ${formatMs(origin)}`}
                          className="h-full shrink-0"
                          style={{ width: pct(origin, maxTotal) }}
                        >
                          <div className={`${SEGS.origin.bg} h-full w-full`} />
                        </PremiumTooltip>
                      )}
                      {unknownTtfb > 1 && (
                        <PremiumTooltip 
                          content={`Unattributed TTFB: ${formatMs(unknownTtfb)}`}
                          className="h-full shrink-0"
                          style={{ width: pct(unknownTtfb, maxTotal) }}
                        >
                          <div className={`${SEGS.ttfb.bg} h-full w-full`} />
                        </PremiumTooltip>
                      )}
                    </>
                  ) : (
                    ttfb > 0 && (
                      <PremiumTooltip 
                        content={`TTFB: ${formatMs(ttfb)} (no Server-Timing breakdown available)`}
                        className="h-full w-full"
                      >
                        <div className={`${SEGS.ttfb.bg} h-full w-full`} />
                      </PremiumTooltip>
                    )
                  )}

                  {download > 0 && (
                    <PremiumTooltip 
                      content={`Download: ${formatMs(download)}`}
                      className="h-full shrink-0"
                      style={{ width: pct(download, maxTotal) }}
                    >
                      <div className={`${SEGS.download.bg} h-full w-full`} />
                    </PremiumTooltip>
                  )}
                </div>

                {/* Axis ticks */}
                <div className="mt-1 flex justify-between leading-none">
                  <span className="text-[9px] text-zinc-400 font-medium">0</span>
                  <span className="text-[9px] text-zinc-400 font-medium">{Math.round(maxTotal / 2)}ms</span>
                  <span className="text-[9px] text-zinc-400 font-medium tabular-nums">{maxTotal}ms</span>
                </div>
              </div>

              {(() => {
                const showDetailBlocks =
                  !hideHeader && (
                    hasServerTiming ||
                    dns > 0 ||
                    tls > 0 ||
                    tcp > 0 ||
                    (!hasBreakdown && !hasServerTiming)
                  )
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
                                <PremiumTooltip content={name}>
                                  <span
                                    className="w-[72px] shrink-0 text-[10px] font-mono text-zinc-500 truncate"
                                  >
                                    {name}
                                  </span>
                                </PremiumTooltip>
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
