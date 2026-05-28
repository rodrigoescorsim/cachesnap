import { isIPv4 } from 'net'

type ValidationResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: 'INVALID_URL' | 'PRIVATE_IP' }

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

function isPrivateHost(hostname: string): boolean {
  if (!hostname) return true

  // Strip IPv6 brackets
  const bare = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  const lower = bare.toLowerCase()

  if (lower === 'localhost') return true

  // IPv6 loopback
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true

  // IPv6 ULA fc00::/7 (covers fc00:: and fd00::)
  if (/^f[cd]/i.test(lower)) return true

  // IPv4-mapped IPv6 ::ffff:a.b.c.d or ::ffff:aabb:ccdd
  const mapped = lower.match(/^::ffff:(.+)$/)
  if (mapped) {
    const rest = mapped[1]
    // dotted-decimal form: ::ffff:127.0.0.1
    if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) {
      return isPrivateIPv4(rest)
    }
    // hex-group form: ::ffff:7f00:1 (Node.js normalises 127.0.0.1 → 7f00:1)
    const hexParts = rest.split(':')
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16)
      const lo = parseInt(hexParts[1], 16)
      if (!isNaN(hi) && !isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
        return isPrivateIPv4(ipv4)
      }
    }
  }

  // Plain IPv4
  if (isIPv4(bare)) return isPrivateIPv4(bare)

  return false
}

export function validatePublicCheckUrl(rawUrl: string): ValidationResult {
  if (!rawUrl) {
    return { ok: false, error: 'URL is required.', code: 'INVALID_URL' }
  }

  if (rawUrl.length > 2048) {
    return { ok: false, error: 'URL must not exceed 2048 characters.', code: 'INVALID_URL' }
  }

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    return { ok: false, error: 'URL must start with http:// or https://', code: 'INVALID_URL' }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'Invalid URL format.', code: 'INVALID_URL' }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URL must not contain credentials.', code: 'INVALID_URL' }
  }

  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, error: 'Private and loopback addresses are not allowed.', code: 'PRIVATE_IP' }
  }

  // Normalize: drop trailing slash on bare root path
  const normalized =
    parsed.pathname === '/' && !parsed.search && !parsed.hash
      ? parsed.toString().replace(/\/$/, '')
      : parsed.toString()

  return { ok: true, url: normalized }
}
