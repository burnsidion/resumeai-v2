import { describe, expect, it } from 'vitest'

import { parseEnvironment } from '../../config/environment'

const validSupabaseEnvironment = {
  NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
  NUXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
}

describe('environment configuration', () => {
  it('uses the foundation default when the app name is omitted', () => {
    expect(parseEnvironment(validSupabaseEnvironment)).toEqual({
      NUXT_PUBLIC_APP_NAME: 'ResumAI',
      ...validSupabaseEnvironment,
    })
  })

  it('trims configured values', () => {
    expect(
      parseEnvironment({
        NUXT_PUBLIC_APP_NAME: ' ResumeAI ',
        NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test-key ',
        NUXT_PUBLIC_SUPABASE_URL: ' https://example.supabase.co ',
      }),
    ).toEqual({
      NUXT_PUBLIC_APP_NAME: 'ResumeAI',
      ...validSupabaseEnvironment,
    })
  })

  it('rejects an explicitly empty app name with a clear error', () => {
    expect(() =>
      parseEnvironment({
        ...validSupabaseEnvironment,
        NUXT_PUBLIC_APP_NAME: '  ',
      }),
    ).toThrowError(
      'Invalid environment configuration: NUXT_PUBLIC_APP_NAME: NUXT_PUBLIC_APP_NAME must not be empty',
    )
  })

  it('reports both required Supabase values when they are missing', () => {
    expect(() => parseEnvironment({})).toThrowError(
      'Invalid environment configuration: NUXT_PUBLIC_SUPABASE_URL: NUXT_PUBLIC_SUPABASE_URL is required; NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required',
    )
  })

  it('rejects an explicitly empty Supabase URL', () => {
    expect(() =>
      parseEnvironment({
        ...validSupabaseEnvironment,
        NUXT_PUBLIC_SUPABASE_URL: '  ',
      }),
    ).toThrowError('NUXT_PUBLIC_SUPABASE_URL must not be empty')
  })

  it.each(['not-a-url', 'ftp://example.supabase.co'])(
    'rejects an invalid Supabase URL: %s',
    (url) => {
      expect(() =>
        parseEnvironment({
          ...validSupabaseEnvironment,
          NUXT_PUBLIC_SUPABASE_URL: url,
        }),
      ).toThrowError('NUXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL')
    },
  )

  it('rejects an explicitly empty Supabase publishable key', () => {
    expect(() =>
      parseEnvironment({
        ...validSupabaseEnvironment,
        NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '  ',
      }),
    ).toThrowError('NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not be empty')
  })

  it.each([
    'arbitrary-key',
    'eyJhbGciOiJIUzI1NiJ9.legacy-key',
    'sb_publishable_',
    'sb_secret_do-not-use',
  ])('rejects a non-publishable Supabase key', (key) => {
    expect(() =>
      parseEnvironment({
        ...validSupabaseEnvironment,
        NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toThrowError(
      'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key starting with sb_publishable_',
    )
  })

  it('does not include a rejected key value in its error', () => {
    const rejectedKey = 'sb_secret_sensitive-test-value'

    expect(() =>
      parseEnvironment({
        ...validSupabaseEnvironment,
        NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: rejectedKey,
      }),
    ).toThrowError(expect.not.stringContaining(rejectedKey))
  })
})
