/**
 * Extract PoP IATA code from CF-Ray or X-Served-By.
 *
 * CF-Ray: `{hex_id}-{COLO}` — e.g. "87c1d4a2b3c4d5e6-GRU" → "GRU"
 * X-Served-By (Fastly): different format — returns null for now.
 */
export function extractPop(servedBy: string | null): string | null {
  if (!servedBy) return null

  // 1. Cloudflare style: hex-IATA (e.g. 87c1d4a2b3c4d5e6-GRU)
  const cfMatch = servedBy.match(/-([A-Z]{2,4})$/)
  if (cfMatch) return cfMatch[1]

  // 2. Vercel style: iata1::xxxx (e.g. gru1::h6r2m) or iata1:iad1::xxxx
  const vercelMatch = servedBy.match(/^([a-z]{3})[0-9]/)
  if (vercelMatch) return vercelMatch[1].toUpperCase()

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
  'CLE': 'Cleveland',
  'SEA': 'Seattle',
  'BFI': 'Seattle',
  'PDX': 'Oregon',
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

/**
 * Infer CDN name from served_by header.
 *
 * - CF-Ray (`{lowercase_hex}-{UPPERCASE_COLO}`) → "Cloudflare"
 * - X-Served-By with "cache-" prefix (Fastly/Varnish) → "Fastly / Varnish"
 * - Otherwise → null
 */
export function detectCdn(servedBy: string | null): string | null {
  if (!servedBy) return null
  if (/^[a-f0-9]+-[A-Z]{2,4}$/.test(servedBy)) return 'Cloudflare'
  if (/cache-[a-z]/i.test(servedBy)) return 'Fastly / Varnish'
  return null
}
