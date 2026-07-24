import { describe, expect, it } from 'vitest'

import { getAuthenticationErrorPageContent } from '../../shared/authentication/error-pages'

describe('authentication error page content', () => {
  it('returns copy for an approved internal error code', () => {
    expect(
      getAuthenticationErrorPageContent('invalid-confirmation-link'),
    ).toMatchObject({
      code: 'invalid-confirmation-link',
      title: 'This confirmation link did not work',
    })
  })

  it.each([
    'Provider internals',
    'invalid_grant',
    ['invalid-confirmation-link'],
    null,
    undefined,
  ])('falls back safely for unapproved input: %j', (input) => {
    const content = getAuthenticationErrorPageContent(input)

    expect(content.code).toBe('authentication-failed')
    expect(content.description).not.toContain(String(input))
  })
})
