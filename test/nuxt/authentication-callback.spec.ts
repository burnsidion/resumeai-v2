import { describe, expect, it, vi } from 'vitest'

import { createAuthenticationCallbackAttempt } from '../../app/utils/authentication/callback'
import type {
  AuthenticationSessionState,
  AuthenticatedUser,
} from '../../shared/authentication/types'

const unauthenticatedSession: AuthenticationSessionState = {
  authenticated: false,
}

const authenticatedUser: AuthenticatedUser = {
  email: 'person@example.com',
  id: 'user-id',
}

const authenticatedSession: AuthenticationSessionState = {
  authenticated: true,
  user: authenticatedUser,
}

describe('authentication callback attempt', () => {
  it('submits a callback code at most once and navigates once', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const resolveSession = vi
      .fn()
      .mockResolvedValueOnce(unauthenticatedSession)
      .mockResolvedValue(authenticatedSession)
    const showError = vi.fn().mockResolvedValue(undefined)
    const submit = vi.fn().mockResolvedValue({
      completed: true,
      redirectTo: '/dashboard',
    })
    const attempt = createAuthenticationCallbackAttempt(
      {
        code: 'single-use-code',
        next: '/dashboard',
      },
      {
        navigate,
        resolveSession,
        showError,
        submit,
      },
    )

    await Promise.all([attempt(), attempt()])
    await attempt()

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith({
      code: 'single-use-code',
      next: '/dashboard',
    })
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/dashboard')
    expect(showError).not.toHaveBeenCalled()
  })

  it('preserves a trusted session when a later exchange reports an invalid link', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const resolveSession = vi
      .fn()
      .mockResolvedValueOnce(unauthenticatedSession)
      .mockResolvedValueOnce(authenticatedSession)
    const showError = vi.fn().mockResolvedValue(undefined)
    const submit = vi.fn().mockRejectedValue({
      data: {
        data: {
          code: 'invalid-confirmation-link',
        },
      },
    })
    const attempt = createAuthenticationCallbackAttempt(
      {
        code: 'already-exchanged-code',
        next: '/dashboard',
      },
      {
        navigate,
        resolveSession,
        showError,
        submit,
      },
    )

    await attempt()

    expect(submit).toHaveBeenCalledTimes(1)
    expect(resolveSession).toHaveBeenCalledTimes(2)
    expect(navigate).toHaveBeenCalledWith('/dashboard')
    expect(showError).not.toHaveBeenCalled()
  })

  it('does not exchange a code when a trusted session already exists', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined)
    const resolveSession = vi.fn().mockResolvedValue(authenticatedSession)
    const showError = vi.fn().mockResolvedValue(undefined)
    const submit = vi.fn()
    const attempt = createAuthenticationCallbackAttempt(
      {
        code: 'stale-code',
        error: 'access_denied',
        next: '/dashboard?from=confirmation',
      },
      {
        navigate,
        resolveSession,
        showError,
        submit,
      },
    )

    await attempt()

    expect(submit).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/dashboard?from=confirmation')
    expect(showError).not.toHaveBeenCalled()
  })
})
