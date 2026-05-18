import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetSession, mockSql, mockCookies, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSql: vi.fn(),
  mockCookies: vi.fn(),
  // redirect() in Next.js throws internally — mirror that so execution stops after redirect
  mockRedirect: vi.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url })
  }),
}))

vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }))
vi.mock('@/lib/db', () => ({ default: mockSql }))
vi.mock('next/headers', () => ({ cookies: mockCookies }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}))

import bcrypt from 'bcryptjs'
import { changePassword, deleteAccount } from './settings'

const userId = '11111111-2222-3333-4444-555555555555'
const userEmail = 'user@example.com'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const mockCookieStore = { get: () => ({ value: 'session-token-abc' }), delete: vi.fn() }

beforeEach(() => {
  vi.resetAllMocks()
  // redirect has no implementation after reset — restore it
  mockRedirect.mockImplementation((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url })
  })
  mockGetSession.mockResolvedValue({ id: userId, email: userEmail, plan: 'free' })
  mockCookies.mockResolvedValue(mockCookieStore)
})

// ── changePassword ────────────────────────────────────────────────────────────

describe('changePassword', () => {
  it('rejects and redirects to login when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    await expect(
      changePassword(undefined, makeFormData({ currentPassword: 'x', newPassword: 'newpass123', confirmNewPassword: 'newpass123' }))
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('returns error for OAuth users', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'acct-id' }]) // OAuth account found
    const result = await changePassword(undefined, makeFormData({
      currentPassword: 'current123',
      newPassword: 'newpass123',
      confirmNewPassword: 'newpass123',
    }))
    expect(result?.errors?.global?.[0]).toMatch(/google/i)
  })

  it('returns error for missing current password', async () => {
    mockSql.mockResolvedValueOnce([]) // no OAuth
    const result = await changePassword(undefined, makeFormData({
      currentPassword: '',
      newPassword: 'newpass123',
      confirmNewPassword: 'newpass123',
    }))
    expect(result?.errors?.currentPassword).toBeDefined()
  })

  it('returns error when new password is too short', async () => {
    mockSql.mockResolvedValueOnce([]) // no OAuth
    const result = await changePassword(undefined, makeFormData({
      currentPassword: 'current123',
      newPassword: 'short',
      confirmNewPassword: 'short',
    }))
    expect(result?.errors?.newPassword).toBeDefined()
  })

  it('returns error when confirm does not match new password', async () => {
    mockSql
      .mockResolvedValueOnce([])                         // no OAuth
      .mockResolvedValueOnce([{ password_hash: 'hash' }]) // fetch hash
    ;(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true) // current password ok
    const result = await changePassword(undefined, makeFormData({
      currentPassword: 'current123',
      newPassword: 'newpass123',
      confirmNewPassword: 'different456',
    }))
    expect(result?.errors?.confirmNewPassword).toBeDefined()
  })

  it('returns error when current password is incorrect', async () => {
    mockSql
      .mockResolvedValueOnce([])                         // no OAuth
      .mockResolvedValueOnce([{ password_hash: 'hash' }]) // fetch hash
    ;(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)
    const result = await changePassword(undefined, makeFormData({
      currentPassword: 'wrongpass',
      newPassword: 'newpass123',
      confirmNewPassword: 'newpass123',
    }))
    expect(result?.errors?.currentPassword?.[0]).toMatch(/incorrect/i)
  })

  it('returns error when new password equals current password', async () => {
    mockSql
      .mockResolvedValueOnce([])                         // no OAuth
      .mockResolvedValueOnce([{ password_hash: 'hash' }]) // fetch hash
    ;(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)
    const result = await changePassword(undefined, makeFormData({
      currentPassword: 'samepass123',
      newPassword: 'samepass123',
      confirmNewPassword: 'samepass123',
    }))
    expect(result?.errors?.newPassword?.[0]).toMatch(/different/i)
  })

  it('updates password, invalidates other sessions, and returns success', async () => {
    mockSql
      .mockResolvedValueOnce([])                          // no OAuth
      .mockResolvedValueOnce([{ password_hash: 'hash' }]) // fetch hash
      .mockResolvedValueOnce([])                          // UPDATE password
      .mockResolvedValueOnce([])                          // DELETE other sessions
    ;(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)
    ;(bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValueOnce('new-hash')

    const result = await changePassword(undefined, makeFormData({
      currentPassword: 'current123',
      newPassword: 'newpass456',
      confirmNewPassword: 'newpass456',
    }))

    expect(result?.success).toBe(true)
    const sqlCalls = mockSql.mock.calls
    const deleteCall = sqlCalls.find((c) =>
      (c[0] as TemplateStringsArray).join('').includes('DELETE FROM sessions')
    )
    expect(deleteCall).toBeDefined()
  })
})

// ── deleteAccount ─────────────────────────────────────────────────────────────

describe('deleteAccount', () => {
  it('rejects and redirects to login when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    await expect(
      deleteAccount(undefined, makeFormData({ confirmation: 'anything' }))
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('returns error when email confirmation is wrong for OAuth user', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'acct-id' }]) // OAuth found
    const result = await deleteAccount(undefined, makeFormData({ confirmation: 'wrong@email.com' }))
    expect(result?.errors?.confirmation?.[0]).toMatch(/email/i)
    expect(mockRedirect).not.toHaveBeenCalledWith('/')
  })

  it('deletes OAuth account when email confirmation matches', async () => {
    const mockDelete = vi.fn()
    mockCookies.mockResolvedValue({ get: () => ({ value: 'token' }), delete: mockDelete })
    mockSql
      .mockResolvedValueOnce([{ id: 'acct-id' }])  // OAuth found
      .mockResolvedValueOnce([])                    // DELETE users

    await expect(
      deleteAccount(undefined, makeFormData({ confirmation: userEmail }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(mockDelete).toHaveBeenCalledWith('session')
  })

  it('returns error when password confirmation is wrong for non-OAuth user', async () => {
    mockSql
      .mockResolvedValueOnce([])                          // no OAuth
      .mockResolvedValueOnce([{ password_hash: 'hash' }]) // fetch hash
    ;(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)

    const result = await deleteAccount(undefined, makeFormData({ confirmation: 'wrongpass' }))
    expect(result?.errors?.confirmation?.[0]).toMatch(/incorrect/i)
    expect(mockRedirect).not.toHaveBeenCalledWith('/')
  })

  it('deletes non-OAuth account when password confirmation matches', async () => {
    const mockDelete = vi.fn()
    mockCookies.mockResolvedValue({ get: () => ({ value: 'token' }), delete: mockDelete })
    mockSql
      .mockResolvedValueOnce([])                          // no OAuth
      .mockResolvedValueOnce([{ password_hash: 'hash' }]) // fetch hash
      .mockResolvedValueOnce([])                          // DELETE users
    ;(bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)

    await expect(
      deleteAccount(undefined, makeFormData({ confirmation: 'correctpassword' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(mockDelete).toHaveBeenCalledWith('session')
  })
})
