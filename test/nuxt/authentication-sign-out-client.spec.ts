import { describe, expect, it, vi } from 'vitest'

import { completeAuthenticationSignOut } from '../../app/utils/authentication/sign-out'
import { getProtectedRouteRedirect } from '../../shared/authentication/navigation'
import type { AuthenticationSessionState } from '../../shared/authentication/types'

const unauthenticatedSession: AuthenticationSessionState = {
  authenticated: false,
}

const authenticatedSession: AuthenticationSessionState = {
  authenticated: true,
  user: {
    email: 'person@example.com',
    id: 'user-id',
  },
}

describe('authentication sign-out client orchestration', () => {
  it('verifies the cleared session and redirects to sign in', async () => {
    const navigateToSignIn = vi.fn().mockResolvedValue(undefined)
    const requestSignOut = vi.fn().mockResolvedValue({ signedOut: true })
    const resolveSession = vi.fn().mockResolvedValue(unauthenticatedSession)

    await expect(
      completeAuthenticationSignOut({
        navigateToSignIn,
        requestSignOut,
        resolveSession,
      }),
    ).resolves.toBeNull()

    expect(requestSignOut).toHaveBeenCalledTimes(1)
    expect(resolveSession).toHaveBeenCalledTimes(1)
    expect(navigateToSignIn).toHaveBeenCalledTimes(1)
  })

  it('denies later dashboard access with the resolved post-sign-out state', async () => {
    const resolvedSession = unauthenticatedSession

    await completeAuthenticationSignOut({
      navigateToSignIn: vi.fn(),
      requestSignOut: vi.fn().mockResolvedValue({ signedOut: true }),
      resolveSession: vi.fn().mockResolvedValue(resolvedSession),
    })

    expect(getProtectedRouteRedirect(resolvedSession, '/dashboard')).toEqual({
      path: '/sign-in',
      query: { next: '/dashboard' },
    })
  })

  it('redirects when the session was cleared despite a late request error', async () => {
    const navigateToSignIn = vi.fn().mockResolvedValue(undefined)

    await expect(
      completeAuthenticationSignOut({
        navigateToSignIn,
        requestSignOut: vi.fn().mockRejectedValue({
          data: {
            data: {
              code: 'service-unavailable',
            },
          },
        }),
        resolveSession: vi.fn().mockResolvedValue(unauthenticatedSession),
      }),
    ).resolves.toBeNull()

    expect(navigateToSignIn).toHaveBeenCalledTimes(1)
  })

  it('returns a sanitized error when the trusted session remains active', async () => {
    const navigateToSignIn = vi.fn()

    await expect(
      completeAuthenticationSignOut({
        navigateToSignIn,
        requestSignOut: vi.fn().mockRejectedValue({
          data: {
            data: {
              code: 'service-unavailable',
              message: 'Sensitive provider explanation',
            },
          },
        }),
        resolveSession: vi.fn().mockResolvedValue(authenticatedSession),
      }),
    ).resolves.toEqual({
      code: 'service-unavailable',
      message: 'Authentication is temporarily unavailable. Try again later.',
    })

    expect(navigateToSignIn).not.toHaveBeenCalled()
  })
})
