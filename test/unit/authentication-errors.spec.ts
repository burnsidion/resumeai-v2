import { describe, expect, it } from 'vitest'

import {
  createAuthenticationError,
  translateAuthenticationError,
} from '../../shared/authentication/errors'

describe('authentication error translation', () => {
  it.each([
    ['invalid_credentials', 'invalid-credentials'],
    ['email_not_confirmed', 'email-not-confirmed'],
    ['user_already_exists', 'unknown'],
    ['weak_password', 'weak-password'],
    ['over_request_rate_limit', 'rate-limited'],
    ['session_expired', 'unauthenticated'],
    ['request_timeout', 'service-unavailable'],
  ])('translates provider code %s to %s', (providerCode, expectedCode) => {
    expect(translateAuthenticationError({ code: providerCode })).toMatchObject({
      code: expectedCode,
    })
  })

  it('uses a safe fallback for unknown provider errors', () => {
    expect(
      translateAuthenticationError({
        code: 'new_provider_error',
        message: 'Internal provider details and credentials',
      }),
    ).toEqual(createAuthenticationError('unknown'))
  })

  it('does not expose the provider message', () => {
    const providerMessage = 'Sensitive provider diagnostic'

    expect(
      translateAuthenticationError({
        code: 'invalid_credentials',
        message: providerMessage,
      }).message,
    ).not.toContain(providerMessage)
  })
})
