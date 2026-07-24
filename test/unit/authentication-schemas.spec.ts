import { describe, expect, it } from 'vitest'

import {
  authenticationCallbackRequestSchema,
  signInCredentialsSchema,
  signUpCredentialsSchema,
} from '../../shared/authentication/schemas'

describe('authentication form schemas', () => {
  it('normalizes a valid email and accepts a valid sign-in password', () => {
    expect(
      signInCredentialsSchema.parse({
        email: '  person@example.com ',
        password: 'eight-characters',
      }),
    ).toEqual({
      email: 'person@example.com',
      password: 'eight-characters',
    })
  })

  it('rejects invalid sign-in fields with field-specific feedback', () => {
    const result = signInCredentialsSchema.safeParse({
      email: 'not-an-email',
      password: 'short',
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        email: ['Enter a valid email address.'],
        password: ['Use at least 8 characters.'],
      })
    }
  })

  it('requires matching signup passwords', () => {
    const result = signUpCredentialsSchema.safeParse({
      confirmPassword: 'different-password',
      email: 'person@example.com',
      password: 'valid-password',
    })

    expect(result.success).toBe(false)

    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toEqual([
        'Passwords must match.',
      ])
    }
  })
})

describe('authentication callback schema', () => {
  it('accepts a bounded code and optional internal destination', () => {
    expect(
      authenticationCallbackRequestSchema.parse({
        code: 'authentication-code',
        next: '/dashboard',
      }),
    ).toEqual({
      code: 'authentication-code',
      next: '/dashboard',
    })
  })

  it('rejects empty callback codes', () => {
    expect(
      authenticationCallbackRequestSchema.safeParse({ code: '  ' }).success,
    ).toBe(false)
  })
})
