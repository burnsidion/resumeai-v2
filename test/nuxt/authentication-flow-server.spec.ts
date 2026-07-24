import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { completeAuthenticationCallback } from '../../server/utils/authentication/callback'
import { toAuthenticationSessionState } from '../../server/utils/authentication/session'

const createCallbackClient = (result: unknown) =>
  ({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue(result),
    },
  }) as unknown as {
    auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession'>
  }

const createAuthenticationEvent = () =>
  ({ context: {}, path: '/api/auth/callback' }) as H3Event

describe('authentication callback completion', () => {
  it('exchanges the code and returns a validated internal destination', async () => {
    const event = createAuthenticationEvent()
    const markResponsePrivate = vi.fn()
    const client = createCallbackClient({ data: {}, error: null })

    await expect(
      completeAuthenticationCallback(
        event,
        {
          code: 'authentication-code',
          next: '/dashboard?from=confirmation',
        },
        {
          createClient: () => client,
          markResponsePrivate,
        },
      ),
    ).resolves.toEqual({
      completed: true,
      redirectTo: '/dashboard?from=confirmation',
    })
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'authentication-code',
    )
    expect(markResponsePrivate).toHaveBeenCalledWith(event)
  })

  it('rejects an unsafe post-confirmation destination', async () => {
    const event = createAuthenticationEvent()

    await expect(
      completeAuthenticationCallback(
        event,
        {
          code: 'authentication-code',
          next: 'https://attacker.example',
        },
        {
          createClient: () => createCallbackClient({ data: {}, error: null }),
          markResponsePrivate: vi.fn(),
        },
      ),
    ).resolves.toMatchObject({
      completed: true,
      redirectTo: '/dashboard',
    })
  })

  it('maps rejected or expired codes to a sanitized page error', async () => {
    const event = createAuthenticationEvent()

    await expect(
      completeAuthenticationCallback(
        event,
        { code: 'expired-code' },
        {
          createClient: () =>
            createCallbackClient({
              data: null,
              error: {
                code: 'flow_state_expired',
                message: 'Sensitive provider explanation',
              },
            }),
          markResponsePrivate: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      completed: false,
      errorCode: 'invalid-confirmation-link',
    })
  })

  it('distinguishes temporary provider unavailability without leaking details', async () => {
    const event = createAuthenticationEvent()

    await expect(
      completeAuthenticationCallback(
        event,
        { code: 'authentication-code' },
        {
          createClient: () =>
            createCallbackClient({
              data: null,
              error: {
                code: 'request_timeout',
                message: 'Sensitive provider explanation',
              },
            }),
          markResponsePrivate: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      completed: false,
      errorCode: 'authentication-unavailable',
    })
  })
})

describe('authentication session response', () => {
  it('returns trusted identity without adding profile or metadata concerns', () => {
    expect(
      toAuthenticationSessionState({
        authenticated: true,
        user: {
          email: 'person@example.com',
          id: 'user-id',
        },
      }),
    ).toEqual({
      authenticated: true,
      user: {
        email: 'person@example.com',
        id: 'user-id',
      },
    })
  })

  it('does not expose provider errors for unauthenticated requests', () => {
    expect(
      toAuthenticationSessionState({
        authenticated: false,
        error: {
          code: 'service-unavailable',
          message:
            'Authentication is temporarily unavailable. Try again later.',
        },
      }),
    ).toEqual({
      authenticated: false,
    })
  })
})
