import { extractPop, popToCity, resolveCdnLabel } from '@/lib/edge-helpers'
import { isCacheHit, getCacheDisplayLabel, getCacheStatusTooltip } from '@/lib/cache-utils'
import {
  breakdownColor,
  breakdownEntries,
  cacheClass,
  formatAge,
  pct,
} from './probe-waterfall.helpers'
import { TIMING } from './timing-metrics-palette'
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
  // Optional range data for aggregated views (Global Aggregate)
  ranges?: Record<string, { min: number; max: number } | null>
}

// ── segment palette (for legend + bars) — matches timing-metrics-palette ───
const SEGS = {
  dns: { bg: TIMING.dns.bar, label: 'DNS' },
  tcp: { bg: TIMING.tcp.bar, label: 'TCP' },
  tls: { bg: TIMING.tls.bar, label: 'TLS' },
  edge: { bg: TIMING.edge.bar, label: 'Edge' },
  origin: { bg: TIMING.origin.bar, label: 'Origin' },
  ttfb: { bg: TIMING.ttfb.bar, label: 'TTFB' },
  download: { bg: TIMING.download.bar, label: 'Download' },
} as const

// ── helpers ─────────────────────────────────────────────────────────────────

function formatMs(value: number | null): string {
  if (value == null || value <= 0) return '—'
  return `${Math.round(value)}ms`
}

function formatRangeMs(range: { min: number; max: number } | null | undefined): React.ReactNode {
  if (!range) return null
  return (
    <span className="text-zinc-500 ml-1 font-normal">
      (Min: {Math.round(range.min)}ms / Max: {Math.round(range.max)}ms)
    </span>
  )
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
                <span>{seg.label}</span>
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

      <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-border bg-surface dark:divide-white/10">
        {probes.map(probe => {
          const total = Number(probe.total_ms ?? probe.ttfb_ms ?? 0)
          const ttfb = Number(probe.ttfb_ms ?? 0)
          const download = Math.max(0, total - ttfb)
          const dns = Number(probe.dns_ms ?? 0)
          const tls = Number(probe.tls_ms ?? 0)
          const tcp = Number(probe.server_timing_breakdown?.tcp_ms ?? 0)
          let edge = Number(probe.edge_ms ?? 0)
          let origin = Number(probe.origin_ms ?? 0)

          // Heuristic: If cache is a MISS (or similar) and we have no origin timing,
          // the "processing" time is almost certainly the origin fetch.
          // We move edge_ms to origin_ms to avoid the "Contradictory Edge time on MISS" UX bug.
          const hit = isCacheHit(probe.cache_status)
          const isExplicitMiss = probe.cache_status && ['MISS', 'BYPASS', 'DYNAMIC', 'EXPIRED'].includes(probe.cache_status.toUpperCase())
          const isGlobalMiss = probe.cache_status?.includes('%') && parseFloat(probe.cache_status) < 10 // Threshold for aggregate view

          if (!hit && (isExplicitMiss || isGlobalMiss)) {
            if (origin === 0 && edge > 0) {
              origin = edge
              edge = 0
            }
          }

          // Portion of TTFB not explained by DNS, TLS, edge+origin Server-Timing entries
          const attributedTtfb = dns + tls + tcp + edge + origin
          let unknownTtfb = Math.max(0, ttfb - attributedTtfb)

          // If it's a MISS, "unknown" time is also likely origin fetch time
          if (!hit && (isExplicitMiss || isGlobalMiss) && unknownTtfb > 0) {
            origin += unknownTtfb
            unknownTtfb = 0
          }
          
          // We split the waterfall into two rows for the TTFB duration.
          // Top row: A continuous bar for the total TTFB.
          // Bottom row: The breakdown of DNS, TCP, TLS, Edge, Origin.
          const hasBreakdown = dns > 0 || tcp > 0 || tls > 0 || edge > 0 || origin > 0
          const hasServerTiming = breakdownEntries(probe.server_timing_breakdown).length > 0

          const pop = extractPop(probe.served_by)
          const cdnLabel = resolveCdnLabel(probe.cdn_provider, probe.served_by)
          const regionLabel = regionLabels[probe.region] ?? probe.region
          const age = formatAge(probe.age_s)
          const isStale = probe.age_s != null && probe.age_s > 86_400

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
                      <PremiumTooltip content={getCacheStatusTooltip(probe.cache_status)}>
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${cacheClass(probe.cache_status)}`}>
                          {getCacheDisplayLabel(probe.cache_status)}
                        </span>
                      </PremiumTooltip>
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
                      <PremiumTooltip content={`Cache-Control Age: ${probe.age_s}s${isStale ? ' — stale cache content detected' : ''}`}>
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${isStale
                            ? 'border-red-500/20 bg-red-500/5 text-red-400'
                            : 'border-border bg-white/5 text-zinc-500'
                            }`}
                        >
                          Age {age}{isStale ? ' ⚠' : ''}
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
                    {SEGS.ttfb.label} <span className={`font-bold ${TIMING.ttfb.text}`}>{formatMs(ttfb)}</span>
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
                <div className="flex h-7 w-full overflow-hidden rounded bg-background/50 ring-1 ring-inset ring-white/5 items-stretch gap-0">
                  {/* We use flex-grow for pixel-perfect proportions without rounding gaps */}
                  {ttfb > 0 && (
                    <div 
                      className="grid grid-rows-2 h-full shrink-0 gap-0" 
                      style={{ flexGrow: ttfb, flexBasis: 0 }}
                    >
                      {/* Top: Continuous TTFB bar */}
                      <div className="relative overflow-hidden">
                        <PremiumTooltip 
                          content={
                            <span className="text-[10px] font-medium text-zinc-300">
                              Total TTFB <span className={`font-bold ${TIMING.ttfb.text}`}>{formatMs(ttfb)}</span>
                              {formatRangeMs(probe.ranges?.ttfb_ms)}
                            </span>
                          }
                          className="!flex h-full w-full"
                        >
                          <div className={`${SEGS.ttfb.bg} h-full w-full`} />
                        </PremiumTooltip>
                      </div>

                      {/* Bottom: Breakdown */}
                      <div className="flex h-full w-full overflow-hidden items-stretch gap-0">
                        {hasBreakdown ? (
                          <>
                            {dns > 0 && (
                              <div style={{ flexGrow: dns, flexBasis: 0 }} className="h-full">
                                <PremiumTooltip 
                                  content={
                                    <span className="text-[10px] font-medium text-zinc-300">
                                      DNS <span className={`font-bold ${TIMING.dns.text}`}>{formatMs(dns)}</span>
                                      {formatRangeMs(probe.ranges?.dns_ms)}
                                    </span>
                                  } 
                                  className="!flex h-full w-full"
                                >
                                  <div className={`${SEGS.dns.bg} h-full w-full`} />
                                </PremiumTooltip>
                              </div>
                            )}
                            {tcp > 0 && (
                              <div style={{ flexGrow: tcp, flexBasis: 0 }} className="h-full">
                                <PremiumTooltip 
                                  content={
                                    <span className="text-[10px] font-medium text-zinc-300">
                                      TCP <span className={`font-bold ${TIMING.tcp.text}`}>{formatMs(tcp)}</span>
                                      {formatRangeMs(probe.ranges?.tcp_ms)}
                                    </span>
                                  } 
                                  className="!flex h-full w-full"
                                >
                                  <div className={`${SEGS.tcp.bg} h-full w-full`} />
                                </PremiumTooltip>
                              </div>
                            )}
                            {tls > 0 && (
                              <div style={{ flexGrow: tls, flexBasis: 0 }} className="h-full">
                                <PremiumTooltip 
                                  content={
                                    <span className="text-[10px] font-medium text-zinc-300">
                                      TLS <span className={`font-bold ${TIMING.tls.text}`}>{formatMs(tls)}</span>
                                      {formatRangeMs(probe.ranges?.tls_ms)}
                                    </span>
                                  } 
                                  className="!flex h-full w-full"
                                >
                                  <div className={`${SEGS.tls.bg} h-full w-full`} />
                                </PremiumTooltip>
                              </div>
                            )}
                            {edge > 0 && (
                              <div style={{ flexGrow: edge, flexBasis: 0 }} className="h-full">
                                <PremiumTooltip 
                                  content={
                                    <span className="text-[10px] font-medium text-zinc-300">
                                      Edge <span className={`font-bold ${TIMING.edge.text}`}>{formatMs(edge)}</span>
                                      {formatRangeMs(probe.ranges?.edge_ms)}
                                    </span>
                                  } 
                                  className="!flex h-full w-full"
                                >
                                  <div className={`${SEGS.edge.bg} h-full w-full`} />
                                </PremiumTooltip>
                              </div>
                            )}
                            {origin > 0 && (
                              <div style={{ flexGrow: origin, flexBasis: 0 }} className="h-full">
                                <PremiumTooltip 
                                  content={
                                    <span className="text-[10px] font-medium text-zinc-300">
                                      Origin <span className={`font-bold ${TIMING.origin.text}`}>{formatMs(origin)}</span>
                                      {formatRangeMs(probe.ranges?.origin_ms)}
                                    </span>
                                  } 
                                  className="!flex h-full w-full"
                                >
                                  <div className={`${SEGS.origin.bg} h-full w-full`} />
                                </PremiumTooltip>
                              </div>
                            )}
                            {unknownTtfb > 0.5 && (
                              <div style={{ flexGrow: unknownTtfb, flexBasis: 0 }} className="h-full">
                                <PremiumTooltip 
                                  panelSizing="hug"
                                  interactive={true}
                                  content={
                                    <div className="text-[10px] leading-snug">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <span className="font-bold text-zinc-200">TTFB (unattributed)</span>
                                        <span className={`font-bold ${TIMING.ttfb.text}`}>{formatMs(unknownTtfb)}</span>
                                      </div>
                                      <p className="mt-1 text-zinc-400">
                                        Part of Time to First Byte not explained by DNS, TCP, TLS, or edge/origin slices from{' '}
                                        <code className="rounded bg-white/5 px-1 font-mono text-[9px] text-zinc-300">Server-Timing</code>.
                                      </p>
                                      <p className="mt-1 text-zinc-400">
                                        Large values often mean waiting on the edge or app after headers are parsed.
                                      </p>
                                    </div>
                                  } 
                                  className="!flex h-full w-full"
                                >
                                  <div className={`${SEGS.ttfb.bg} h-full w-full`} />
                                </PremiumTooltip>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className={`${SEGS.ttfb.bg} h-full w-full`} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Download Section (Unique) */}
                  {download > 0 && (
                    <div 
                      className="h-full shrink-0" 
                      style={{ flexGrow: download, flexBasis: 0 }}
                    >
                      <PremiumTooltip 
                        content={
                          <span className="text-[10px] font-medium text-zinc-300">
                            Download <span className={`font-bold ${TIMING.download.text}`}>{formatMs(download)}</span>
                            {formatRangeMs(probe.ranges?.download_ms)}
                          </span>
                        }
                        className="!flex h-full w-full"
                      >
                        <div className={`${SEGS.download.bg} h-full w-full`} />
                      </PremiumTooltip>
                    </div>
                  )}

                  {/* Remaining space to fill maxTotal scale */}
                  {maxTotal > total && (
                    <div style={{ flexGrow: maxTotal - total, flexBasis: 0 }} />
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
                  <details className="group mt-1 border-t border-zinc-100 dark:border-white/10">
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
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
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
                          className={`bg-zinc-50/50 py-1.5 dark:bg-white/[0.02] ${hasServerTiming ? 'border-t border-zinc-100 dark:border-white/10' : ''}`}
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
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
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
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
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
                                <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
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
                        <div className={`py-1.5 ${hasServerTiming || dns > 0 || tls > 0 || tcp > 0 ? 'border-t border-zinc-100 dark:border-white/10' : ''}`}>
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
