/**
 * Extrai o código IATA do PoP a partir de um CF-Ray ou X-Served-By.
 *
 * CF-Ray format: `{hex_id}-{COLO}` — ex: "87c1d4a2b3c4d5e6-GRU" → "GRU"
 * X-Served-By (Fastly): formato diferente — retorna null por enquanto.
 */
export function extractPop(servedBy: string | null): string | null {
  if (!servedBy) return null
  const m = servedBy.match(/-([A-Z]{2,4})$/)
  return m ? m[1] : null
}

/**
 * Infere o nome do CDN a partir do valor do header served_by.
 *
 * - CF-Ray (`{lowercase_hex}-{UPPERCASE_COLO}`) → "Cloudflare"
 * - X-Served-By com prefixo "cache-" (Fastly/Varnish) → "Fastly / Varnish"
 * - Demais → null (desconhecido)
 */
export function detectCdn(servedBy: string | null): string | null {
  if (!servedBy) return null
  if (/^[a-f0-9]+-[A-Z]{2,4}$/.test(servedBy)) return 'Cloudflare'
  if (/cache-[a-z]/i.test(servedBy)) return 'Fastly / Varnish'
  return null
}
