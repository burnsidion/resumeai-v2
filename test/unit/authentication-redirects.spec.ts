import { describe, expect, it } from 'vitest'

import { getSafeInternalRedirect } from '../../shared/authentication/redirects'

describe('internal authentication redirects', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/applications?status=open', '/applications?status=open'],
    ['/auth/complete#result', '/auth/complete#result'],
  ])('accepts internal destination %s', (destination, expected) => {
    expect(getSafeInternalRedirect(destination)).toBe(expected)
  })

  it.each([
    'https://attacker.example',
    '//attacker.example/path',
    '/\\attacker.example/path',
    'javascript:alert(1)',
    'dashboard',
    '',
  ])('rejects unsafe destination %s', (destination) => {
    expect(getSafeInternalRedirect(destination)).toBe('/')
  })

  it('uses only a validated internal fallback', () => {
    expect(getSafeInternalRedirect('https://attacker.example', '/signin')).toBe(
      '/signin',
    )
    expect(
      getSafeInternalRedirect('https://attacker.example', '//attacker.example'),
    ).toBe('/')
  })

  it('rejects non-string destinations', () => {
    expect(getSafeInternalRedirect({ next: '/dashboard' })).toBe('/')
  })
})
