/**
 * Extrai o código IATA do PoP a partir de um CF-Ray ou X-Served-By.
 *
 * CF-Ray format: `{hex_id}-{COLO}` — ex: "87c1d4a2b3c4d5e6-GRU" → "GRU"
 * X-Served-By (Fastly): formato diferente — retorna null por enquanto.
 */
export function extractPop(servedBy: string | null): string | null {
  if (!servedBy) return null
  
  // 1. Cloudflare style: hex-IATA (ex: 87c1d4a2b3c4d5e6-GRU)
  const cfMatch = servedBy.match(/-([A-Z]{2,4})$/)
  if (cfMatch) return cfMatch[1]

  // 2. Vercel style: iata1::xxxx (ex: gru1::h6r2m) ou iata1:iad1::xxxx
  const vercelMatch = servedBy.match(/^([a-z]{3})[0-9]/)
  if (vercelMatch) return vercelMatch[1].toUpperCase()

  // 3. Fastly style fallback: cache-gru1234
  const fastlyMatch = servedBy.match(/cache-([a-z]{3})[0-9]/)
  if (fastlyMatch) return fastlyMatch[1].toUpperCase()

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
  'IAD': 'Dulles/Virginia',
  'JFK': 'New York',
  'EWR': 'Newark',
  'LAX': 'Los Angeles',
  'SFO': 'San Francisco',
  'SJC': 'San Jose',
  'ORD': 'Chicago',
  'DFW': 'Dallas',
  'MIA': 'Miami',
  'ATL': 'Atlanta',
  'CMH': 'Ohio',
  'CLE': 'Cleveland',
  'SEA': 'Seattle',
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
  'MXP': 'Milan',
  'ARN': 'Stockholm',
  'WAW': 'Warsaw',
  'PRG': 'Prague',
  'VIE': 'Vienna',
  'ZUR': 'Zurich',
  
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
  
  // Africa
  'CPT': 'Cape Town',
  'JNB': 'Johannesburg',
}

/**
 * Traduz um código IATA para o nome da cidade amigável.
 * Se não encontrar, retorna o código original.
 */
export function popToCity(iata: string | null): string | null {
  if (!iata) return null
  return POP_CITY_MAP[iata.toUpperCase()] || iata
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
