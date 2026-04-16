/**
 * CDN / edge label from response headers + served_by (mirror of src/lib/cdn-providers.ts).
 * Update both files together when changing heuristics.
 */

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function header(h, name) {
  const key = name.toLowerCase();
  const v = h[key];
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * @param {import('http').IncomingHttpHeaders} h
 * @param {string | null} servedBy
 * @returns {string | null}
 */
export function detectCdnProviderFromHeaders(h, servedBy) {
  const server = norm(header(h, 'server'));
  const via = norm(header(h, 'via'));
  const sb = servedBy ?? '';
  const xServedBy = header(h, 'x-served-by') ?? '';

  if (header(h, 'cf-ray')) return 'Cloudflare';
  if (header(h, 'x-amz-cf-id') || header(h, 'x-amz-cf-pop')) return 'AWS CloudFront';
  if (header(h, 'x-vercel-id')) return 'Vercel';
  if (server.includes('vercel')) return 'Vercel';

  if (header(h, 'x-nf-request-id') || via.includes('netlify') || server.includes('netlify')) return 'Netlify';

  if (header(h, 'x-bunnycdn-cache') || server.includes('bunnycdn') || server.includes('bunny')) return 'BunnyCDN';

  if (header(h, 'x-sucuri-cache') || server.includes('sucuri')) return 'Sucuri';

  if (header(h, 'x-litespeed-cache') || header(h, 'x-litespeed-tag')) return 'QUIC.cloud / LiteSpeed';

  if (header(h, 'x-fastly-request-id') || header(h, 'x-timer')) return 'Fastly';
  if (xServedBy && /cache-[a-z]/i.test(xServedBy)) return 'Fastly';

  if (header(h, 'x-akamai-request-id') || header(h, 'akamai-origin-hop') || server.includes('akamai')) return 'Akamai';

  if (header(h, 'x-azure-ref') || server.includes('azure')) return 'Azure CDN';

  if (header(h, 'x-keycdn-cache') || server.includes('keycdn')) return 'KeyCDN';

  if (via.includes('incapsula') || server.includes('imperva')) return 'Imperva';

  if (server.includes('fly.io') || server.includes('fly.dev')) return 'Fly.io';

  if (server.includes('cloudflare')) return 'Cloudflare';
  if (server.includes('cloudfront')) return 'AWS CloudFront';

  if (server.includes('gfe') || server.includes('google')) return 'Google';

  if (/^[a-f0-9]+-[A-Z]{2,4}$/.test(sb)) return 'Cloudflare';
  if (/^([a-z]{3})[0-9]+::/i.test(sb)) return 'Vercel';
  if (/cache-[a-z]/i.test(sb)) return 'Fastly';
  if (/^[A-Z]{3}\d+-[A-Z]\d+$/i.test(sb.trim())) return 'AWS CloudFront';

  return null;
}
