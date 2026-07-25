import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { signOutCurrentAuthenticationSession } from '../../server/utils/authentication/sign-out'

type AuthenticationSignOutClient = {
  auth: Pick<SupabaseClient['auth'], 'signOut'>
}

const createAuthenticationEvent = () =>
  ({ context: {}, path: '/api/auth/sign-out' }) as H3Event

const createSignOutClient = (result: unknown): AuthenticationSignOutClient =>
  ({
    auth: {
      signOut: vi.fn().mockResolvedValue(result),
    },
  }) as unknown as AuthenticationSignOutClient

describe('current authentication session sign-out', () => {
  it('signs out only the current session and prevents caching', async () => {
    const event = createAuthenticationEvent()
    const client = createSignOutClient({ error: null })
    const markResponsePrivate = vi.fn()

    await expect(
      signOutCurrentAuthenticationSession(event, {
        createClient: () => client,
        markResponsePrivate,
      }),
    ).resolves.toBeNull()

    expect(client.auth.signOut).toHaveBeenCalledTimes(1)
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(markResponsePrivate).toHaveBeenCalledWith(event)
  })

  it('returns a sanitized temporary failure without exposing provider details', async () => {
    const event = createAuthenticationEvent()
    const client = createSignOutClient({
      error: {
        code: 'request_timeout',
        message: 'Sensitive provider explanation',
      },
    })

    await expect(
      signOutCurrentAuthenticationSession(event, {
        createClient: () => client,
        markResponsePrivate: vi.fn(),
      }),
    ).resolves.toEqual({
      code: 'service-unavailable',
      message: 'Authentication is temporarily unavailable. Try again later.',
    })
  })

  it('normalizes unexpected client failures', async () => {
    const event = createAuthenticationEvent()

    await expect(
      signOutCurrentAuthenticationSession(event, {
        createClient: () => {
          throw new Error('Sensitive configuration detail')
        },
        markResponsePrivate: vi.fn(),
      }),
    ).resolves.toEqual({
      code: 'unknown',
      message: 'Authentication could not be completed.',
    })
  })
})
