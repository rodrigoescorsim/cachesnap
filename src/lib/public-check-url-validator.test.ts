import { describe, it, expect } from 'vitest'
import { validatePublicCheckUrl } from './public-check-url-validator'

describe('validatePublicCheckUrl', () => {
  // ── Valid URLs ──────────────────────────────────────────────────────────────

  it('accepts a valid HTTPS URL', () => {
    const r = validatePublicCheckUrl('https://example.com')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe('https://example.com')
  })

  it('accepts a valid HTTP URL', () => {
    const r = validatePublicCheckUrl('http://example.com/path')
    expect(r.ok).toBe(true)
  })

  it('accepts a URL with valid port', () => {
    expect(validatePublicCheckUrl('https://example.com:8080/path').ok).toBe(true)
  })

  it('accepts a URL with path and query string', () => {
    expect(validatePublicCheckUrl('https://example.com/path?q=1&x=2').ok).toBe(true)
  })

  it('accepts a URL with a public IP address', () => {
    expect(validatePublicCheckUrl('https://1.2.3.4/path').ok).toBe(true)
  })

  // ── Invalid URL format ──────────────────────────────────────────────────────

  it('rejects an empty string', () => {
    const r = validatePublicCheckUrl('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_URL')
  })

  it('rejects a URL without scheme', () => {
    const r = validatePublicCheckUrl('example.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_URL')
  })

  it('rejects a URL exceeding 2048 characters', () => {
    const r = validatePublicCheckUrl('https://example.com/' + 'a'.repeat(2048))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_URL')
  })

  it('rejects a URL with credentials', () => {
    const r = validatePublicCheckUrl('https://user:pass@example.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_URL')
  })

  // ── Private IP / SSRF ───────────────────────────────────────────────────────

  it('rejects localhost', () => {
    const r = validatePublicCheckUrl('http://localhost')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('PRIVATE_IP')
  })

  it('rejects 127.0.0.1 loopback', () => {
    expect(validatePublicCheckUrl('http://127.0.0.1').ok).toBe(false)
  })

  it('rejects RFC-1918 10.x.x.x', () => {
    expect(validatePublicCheckUrl('https://10.0.0.1/secret').ok).toBe(false)
  })

  it('rejects RFC-1918 192.168.x.x', () => {
    expect(validatePublicCheckUrl('http://192.168.1.1').ok).toBe(false)
  })

  it('rejects RFC-1918 172.16.x.x', () => {
    expect(validatePublicCheckUrl('http://172.16.0.1').ok).toBe(false)
  })

  it('rejects RFC-1918 172.31.x.x (upper boundary)', () => {
    expect(validatePublicCheckUrl('http://172.31.255.255').ok).toBe(false)
  })

  it('accepts 172.32.x.x (just outside 172.16-31 range)', () => {
    expect(validatePublicCheckUrl('http://172.32.0.1').ok).toBe(true)
  })

  it('rejects link-local 169.254.x.x', () => {
    expect(validatePublicCheckUrl('http://169.254.169.254').ok).toBe(false)
  })

  it('rejects IPv6 loopback ::1', () => {
    expect(validatePublicCheckUrl('http://[::1]/').ok).toBe(false)
  })

  it('rejects IPv6 ULA fc00::/7', () => {
    expect(validatePublicCheckUrl('http://[fc00::1]/').ok).toBe(false)
  })

  it('rejects IPv6 ULA fd00::/8', () => {
    expect(validatePublicCheckUrl('http://[fd12:3456::1]/').ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 for 127.0.0.1 (dotted-decimal form)', () => {
    expect(validatePublicCheckUrl('http://[::ffff:127.0.0.1]/').ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 for 10.0.0.1 (dotted-decimal form)', () => {
    expect(validatePublicCheckUrl('http://[::ffff:10.0.0.1]/').ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 for 127.0.0.1 (hex-group form, Node.js normalisation)', () => {
    // new URL("http://[::ffff:127.0.0.1]/").hostname === "::ffff:7f00:1"
    // Simulate what Node.js URL parser produces
    const r = validatePublicCheckUrl('http://[::ffff:7f00:1]/')
    expect(r.ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 for 192.168.1.1 (hex-group form)', () => {
    // 192.168 → c0a8, 1.1 → 0101 → ::ffff:c0a8:101
    expect(validatePublicCheckUrl('http://[::ffff:c0a8:101]/').ok).toBe(false)
  })
})
