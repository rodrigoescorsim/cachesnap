import { describe, it, expect } from 'vitest'
import { getSessionTokenFromCookie } from './auth'

describe('getSessionTokenFromCookie', () => {
  it('extracts session token from cookie header', () => {
    expect(getSessionTokenFromCookie('session=abc-123')).toBe('abc-123')
  })

  it('extracts session token from multiple cookies', () => {
    const header = 'theme=dark; session=my-token-xyz; lang=en'
    expect(getSessionTokenFromCookie(header)).toBe('my-token-xyz')
  })

  it('handles token values that contain = (e.g. base64)', () => {
    const header = 'session=abc==; other=val'
    expect(getSessionTokenFromCookie(header)).toBe('abc==')
  })

  it('returns null when session cookie is absent', () => {
    expect(getSessionTokenFromCookie('theme=dark; lang=en')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getSessionTokenFromCookie(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getSessionTokenFromCookie('')).toBeNull()
  })
})
