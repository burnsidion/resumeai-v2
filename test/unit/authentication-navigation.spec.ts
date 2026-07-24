import { describe, expect, it } from 'vitest'

import {
  getGuestRouteRedirect,
  getProtectedRouteRedirect,
  getRootRouteRedirect,
} from '../../shared/authentication/navigation'
import type { AuthenticationSessionState } from '../../shared/authentication/types'

const authenticatedSession: AuthenticationSessionState = {
  authenticated: true,
  user: {
    email: 'person@example.com',
    id: 'user-id',
  },
}

const unauthenticatedSession: AuthenticationSessionState = {
  authenticated: false,
}

describe('protected route navigation', () => {
  it('allows a trusted authenticated session', () => {
    expect(
      getProtectedRouteRedirect(authenticatedSession, '/dashboard'),
    ).toBeNull()
  })

  it('sends an unauthenticated visitor to sign in with a safe return path', () => {
    expect(
      getProtectedRouteRedirect(
        unauthenticatedSession,
        '/dashboard?view=current',
      ),
    ).toEqual({
      path: '/sign-in',
      query: { next: '/dashboard?view=current' },
    })
  })

  it('rejects an external return destination', () => {
    expect(
      getProtectedRouteRedirect(
        unauthenticatedSession,
        'https://attacker.example',
      ),
    ).toEqual({
      path: '/sign-in',
      query: { next: '/dashboard' },
    })
  })
})

describe('guest route navigation', () => {
  it('redirects a signed-in visitor to the protected placeholder', () => {
    expect(getGuestRouteRedirect(authenticatedSession)).toEqual({
      path: '/dashboard',
    })
  })

  it('allows an unauthenticated visitor to use auth pages', () => {
    expect(getGuestRouteRedirect(unauthenticatedSession)).toBeNull()
  })
})

describe('root route navigation', () => {
  it('sends an authenticated user to the protected dashboard', () => {
    expect(getRootRouteRedirect(authenticatedSession)).toEqual({
      path: '/dashboard',
    })
  })

  it('sends an unauthenticated visitor to sign in', () => {
    expect(getRootRouteRedirect(unauthenticatedSession)).toEqual({
      path: '/sign-in',
    })
  })
})
