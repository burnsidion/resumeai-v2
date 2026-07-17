import { describe, expect, it } from 'vitest'

import { parseEnvironment } from '../../config/environment'

describe('environment configuration', () => {
  it('uses the foundation default when the app name is omitted', () => {
    expect(parseEnvironment({})).toEqual({
      NUXT_PUBLIC_APP_NAME: 'ResumAI',
    })
  })

  it('rejects an explicitly empty app name with a clear error', () => {
    expect(() => parseEnvironment({ NUXT_PUBLIC_APP_NAME: '  ' })).toThrowError(
      'Invalid environment configuration: NUXT_PUBLIC_APP_NAME: NUXT_PUBLIC_APP_NAME must not be empty',
    )
  })
})
