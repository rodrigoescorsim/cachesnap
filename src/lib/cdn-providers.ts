/**
 * Heuristic CDN / edge identification from response headers + served_by string.
 * Keep in sync with `probes/lambda/cdn-providers.mjs` (probe runtime).
 *
 * `served_by` remains the raw audit value; this module only produces a stable display label.
 */

export type CdnProviderSignals = {
  servedBy?: string | null
  server?: string | null
  via?: string | null
  cfRay?: string | null
  cfCacheStatus?: string | null
  xAmzCfId?: string | null
  xAmzCfPop?: string | null
  xVercelId?: string | null
  xServedBy?: string | null
  xNfRequestId?: string | null
  xBunnycdnCache?: string | null
  xSucuriCache?: string | null
  xSucuriId?: string | null
  xAkamaiRequestId?: string | null
  xAzureRef?: string | null
  xKeycdn?: string | null
  xFastlyRequestId?: string | null
  xLiteSpeedCache?: string | null
  xLiteSpeedTag?: string | null
  xTimer?: string | null
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function firstHeader(
  h: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const key = name.toLowerCase()
  const v = h[key] ?? h[name]
  if (v == null) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

/** Build signals from Node/IncomingMessage-style lowercase header map. */
export function cdnSignalsFromHeaderMap(
  h: Record<string, string | string[] | undefined>,
): CdnProviderSignals {
  return {
    server: firstHeader(h, 'server'),
    via: firstHeader(h, 'via'),
    cfRay: firstHeader(h, 'cf-ray'),
    cfCacheStatus: firstHeader(h, 'cf-cache-status'),
    xAmzCfId: firstHeader(h, 'x-amz-cf-id'),
    xAmzCfPop: firstHeader(h, 'x-amz-cf-pop'),
    xVercelId: firstHeader(h, 'x-vercel-id'),
    xServedBy: firstHeader(h, 'x-served-by'),
    xNfRequestId: firstHeader(h, 'x-nf-request-id'),
    xBunnycdnCache: firstHeader(h, 'x-bunnycdn-cache'),
    xSucuriCache: firstHeader(h, 'x-sucuri-cache'),
    xSucuriId: firstHeader(h, 'x-sucuri-id'),
    xAkamaiRequestId:
      firstHeader(h, 'x-akamai-request-id') ?? firstHeader(h, 'akamai-origin-hop'),
    xAzureRef: firstHeader(h, 'x-azure-ref'),
    xKeycdn: firstHeader(h, 'x-keycdn-cache'),
    xFastlyRequestId: firstHeader(h, 'x-fastly-request-id'),
    xLiteSpeedCache: firstHeader(h, 'x-litespeed-cache'),
    xLiteSpeedTag: firstHeader(h, 'x-litespeed-tag'),
    xTimer: firstHeader(h, 'x-timer'),
  }
}

/**
 * Returns a stable product label, or null if unknown.
 * Order matters: more specific headers before generic `server` / `servedBy` fallbacks.
 */
export function detectCdnProvider(s: CdnProviderSignals): string | null {
  const server = norm(s.server)
  const via = norm(s.via)
  const servedBy = s.servedBy ?? ''
  const xServedBy = s.xServedBy ?? ''

  if (s.cfRay) return 'Cloudflare'
  if (s.xAmzCfId || s.xAmzCfPop) return 'AWS CloudFront'
  if (s.xVercelId) return 'Vercel'
  if (server.includes('vercel')) return 'Vercel'

  if (s.xNfRequestId || via.includes('netlify') || server.includes('netlify')) return 'Netlify'

  if (s.xBunnycdnCache || server.includes('bunnycdn') || server.includes('bunny')) return 'BunnyCDN'

  if (s.xSucuriCache || s.xSucuriId || server.includes('sucuri')) return 'Sucuri'

  if (s.xLiteSpeedCache || s.xLiteSpeedTag) return 'QUIC.cloud / LiteSpeed'

  if (s.xFastlyRequestId || s.xTimer) return 'Fastly'
  if (xServedBy && /cache-[a-z]/i.test(xServedBy)) return 'Fastly'

  if (s.xAkamaiRequestId || server.includes('akamai')) return 'Akamai'

  if (s.xAzureRef) return 'Azure CDN'

  if (s.xKeycdn || server.includes('keycdn')) return 'KeyCDN'

  if (via.includes('incapsula') || server.includes('imperva')) return 'Imperva'

  if (server.includes('fly.io') || server.includes('fly.dev')) return 'Fly.io'

  if (server.includes('cloudflare')) return 'Cloudflare'
  if (server.includes('cloudfront')) return 'AWS CloudFront'

  if (server.includes('gfe')) return 'Google'

  // served_by-only fallbacks (when headers were not stored)
  if (/^[a-f0-9]+-[A-Z]{2,4}$/.test(servedBy)) return 'Cloudflare'
  if (/^([a-z]{3})[0-9]+::/i.test(servedBy)) return 'Vercel'
  if (/cache-[a-z]/i.test(servedBy)) return 'Fastly'
  // AWS CloudFront POP tokens, e.g. IAD89-P1, SEA19-C1
  if (/^[A-Z]{3}\d+-[A-Z]\d+$/i.test(servedBy.trim())) return 'AWS CloudFront'

  return null
}

/** Prefer persisted probe label; otherwise infer from `served_by` only (legacy rows). */
export function resolveCdnLabel(
  stored: string | null | undefined,
  servedBy: string | null | undefined,
): string | null {
  const s = stored?.trim()
  if (s) return s
  return detectCdnProvider({ servedBy: servedBy ?? null })
}
