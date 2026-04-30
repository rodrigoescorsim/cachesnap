import { detectCdnProvider } from './cdn-providers'

/**
 * Extract PoP IATA code from CF-Ray, X-Served-By (Fastly), or CloudFront POP tokens.
 *
 * CF-Ray: `{hex_id}-{COLO}` — e.g. "87c1d4a2b3c4d5e6-GRU" → "GRU"
 * Fastly: `cache-lax8632-LAX` → "LAX"
 * CloudFront POP: `IAD89-P1` → "IAD"
 */
export function extractPop(servedBy: string | null): string | null {
  if (!servedBy) return null

  // 1. Cloudflare style: hex-IATA (e.g. 87c1d4a2b3c4d5e6-GRU)
  if (/^[a-f0-9]+-[A-Z]{2,4}$/.test(servedBy)) {
    const cfMatch = servedBy.match(/-([A-Z]{2,4})$/)
    if (cfMatch) return cfMatch[1]
  }

  // 2. Vercel style: iata1::xxxx (e.g. gru1::h6r2m) or iata1:iad1::xxxx
  const vercelMatch = servedBy.match(/^([a-z]{3})[0-9]+::/i)
  if (vercelMatch) return vercelMatch[1].toUpperCase()

  // 3. Fastly / Varnish: cache-<node>-<COLO>
  const fastlyMatch = servedBy.match(/cache-[a-z0-9]+-([A-Z]{2,4})$/i)
  if (fastlyMatch) return fastlyMatch[1]

  // 4. AWS CloudFront POP token (leading airport code)
  const cfPop = servedBy.match(/^([A-Z]{3,4})\d+-[A-Z]\d+$/i)
  if (cfPop) return cfPop[1].toUpperCase()

  return null
}

const POP_CITY_MAP: Record<string, string> = {
  // South America
  'GRU': 'São Paulo',
  'CGH': 'São Paulo',
  'GIG': 'Rio de Janeiro',
  'FOR': 'Fortaleza',
  'SSA': 'Salvador',
  'POA': 'Porto Alegre',
  'CWB': 'Curitiba',
  'BSB': 'Brasília',
  'EZE': 'Buenos Aires',
  'SCL': 'Santiago',
  'BOG': 'Bogotá',
  'LIM': 'Lima',

  // North America
  'IAD': 'Dulles, VA',
  'JFK': 'New York',
  'EWR': 'Newark',
  'LAX': 'Los Angeles',
  'SFO': 'San Francisco',
  'SJC': 'San Jose',
  'ORD': 'Chicago',
  'CHI': 'Chicago',
  'DFW': 'Dallas',
  'MIA': 'Miami',
  'ATL': 'Atlanta',
  'CMH': 'Ohio',
  'OHIO': 'Ohio',
  'CLE': 'Cleveland',
  'SEA': 'Seattle',
  'BFI': 'Seattle',
  'PDX': 'Oregon',
  'HIO': 'Hillsboro, OR',
  'YUL': 'Montreal',
  'YYZ': 'Toronto',

  // Europe
  'LHR': 'London',
  'FRA': 'Frankfurt',
  'CDG': 'Paris',
  'AMS': 'Amsterdam',
  'MAD': 'Madrid',
  'BCN': 'Barcelona',
  'MXP': 'Milan',
  'FCO': 'Rome',
  'ARN': 'Stockholm',
  'WAW': 'Warsaw',
  'PRG': 'Prague',
  'VIE': 'Vienna',
  'ZUR': 'Zurich',
  'DUB': 'Dublin',
  'TXL': 'Berlin',
  'BER': 'Berlin',
  'MUC': 'Munich',
  'HAM': 'Hamburg',
  'BRU': 'Brussels',
  'LIS': 'Lisbon',
  'ATH': 'Athens',
  'OTP': 'Bucharest',
  'SOF': 'Sofia',

  // Asia / Pacific
  'SIN': 'Singapore',
  'HKG': 'Hong Kong',
  'NRT': 'Tokyo',
  'HND': 'Tokyo',
  'ICN': 'Seoul',
  'BOM': 'Mumbai',
  'MAA': 'Chennai',
  'DEL': 'Delhi',
  'SYD': 'Sydney',
  'MEL': 'Melbourne',
  'AKL': 'Auckland',
  'WSI': 'Sydney',

  // Africa
  'CPT': 'Cape Town',
  'JNB': 'Johannesburg',
}

/**
 * Map an IATA code to a short city label for the UI.
 * If unknown, returns the code as-is.
 */
export function popToCity(iata: string | null): string | null {
  if (!iata) return null
  return POP_CITY_MAP[iata.toUpperCase()] || iata
}

export { detectCdnProvider, resolveCdnLabel } from './cdn-providers'
