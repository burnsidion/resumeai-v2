import { describe, expect, it } from 'vitest'

import { createEmailConfirmationRedirect } from '../../shared/authentication/urls'

describe('email confirmation redirect', () => {
  it('creates the reserved callback URL with a safe destination', () => {
    expect(
      createEmailConfirmationRedirect(
        'http://localhost:3000',
        '/dashboard?from=signup',
      ),
    ).toBe(
      'http://localhost:3000/auth/callback?next=%2Fdashboard%3Ffrom%3Dsignup',
    )
  })

  it('replaces unsafe destinations with the dashboard', () => {
    expect(
      createEmailConfirmationRedirect(
        'http://localhost:3000',
        'https://attacker.example',
      ),
    ).toBe('http://localhost:3000/auth/callback?next=%2Fdashboard')
  })
})
