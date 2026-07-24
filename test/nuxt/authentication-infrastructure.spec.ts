import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useAuthenticationClient } from '../../app/composables/useAuthenticationClient'
import { createAuthenticationBrowserClient } from '../../app/utils/authentication/supabase'
import type { SupabaseAuthenticationConfiguration } from '../../shared/authentication/types'
import {
  authenticationPrivateResponseHeaders,
  createAuthenticationCookieMethods,
  createAuthenticationServerClient,
  hasAuthenticationCookie,
  type ServerCookieRuntime,
} from '../../server/utils/authentication/supabase'
import {
  resolveAuthenticatedUser,
  type AuthenticationResolverDependencies,
} from '../../server/utils/authentication/user'

const configuration: SupabaseAuthenticationConfiguration = {
  supabasePublishableKey: 'sb_publishable_test-key',
  supabaseUrl: 'https://example.supabase.co',
}

const createEvent = () =>
  ({ context: {}, path: '/' }) as Parameters<typeof resolveAuthenticatedUser>[0]

const createCookieRuntime = () => {
  const writtenCookies: Array<{
    name: string
    options: Record<string, unknown>
    value: string
  }> = []
  const writtenHeaders: Array<Record<string, string>> = []
  const runtime: ServerCookieRuntime = {
    getAll: () => ({
      'sb-project-auth-token': 'session-cookie',
      preference: 'compact',
    }),
    set: (_event, name, value, options) => {
      writtenCookies.push({ name, options, value })
    },
    setHeaders: (_event, headers) => {
      writtenHeaders.push(headers)
    },
  }

  return { runtime, writtenCookies, writtenHeaders }
}

const authenticatedClaims: JwtPayload = {
  aal: 'aal1',
  aud: 'authenticated',
  email: 'person@example.com',
  exp: 2_000_000_000,
  iat: 1_900_000_000,
  iss: 'https://example.supabase.co/auth/v1',
  role: 'authenticated',
  session_id: 'session-id',
  sub: 'user-id',
}

const createClaimsClient = (result: unknown): Pick<SupabaseClient, 'auth'> =>
  ({
    auth: {
      getClaims: vi.fn().mockResolvedValue(result),
    },
  }) as unknown as Pick<SupabaseClient, 'auth'>

describe('Supabase authentication client configuration', () => {
  it('passes only the public project inputs to the browser client factory', () => {
    const fakeClient = { auth: {} } as SupabaseClient
    const clientFactory = vi.fn(() => fakeClient)

    expect(
      createAuthenticationBrowserClient(configuration, clientFactory),
    ).toBe(fakeClient)
    expect(clientFactory).toHaveBeenCalledWith(
      configuration.supabaseUrl,
      configuration.supabasePublishableKey,
      {
        auth: {
          detectSessionInUrl: false,
        },
      },
    )
  })

  it('passes public project inputs and request cookies to the server factory', () => {
    const event = createEvent()
    const { runtime } = createCookieRuntime()
    const fakeClient = { auth: {} } as SupabaseClient
    const clientFactory = vi.fn(() => fakeClient)

    expect(
      createAuthenticationServerClient(event, {
        clientFactory,
        configuration,
        cookieRuntime: runtime,
      }),
    ).toBe(fakeClient)
    expect(clientFactory).toHaveBeenCalledWith(
      configuration.supabaseUrl,
      configuration.supabasePublishableKey,
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    )
  })

  it('provides the browser Auth client through the Nuxt composable', async () => {
    const component = defineComponent({
      setup() {
        const authenticationClient = useAuthenticationClient()

        return () =>
          h(
            'span',
            typeof authenticationClient.getClaims === 'function'
              ? 'available'
              : 'missing',
          )
      },
    })
    const wrapper = await mountSuspended(component)

    expect(wrapper.text()).toBe('available')
  })
})

describe('SSR authentication cookies', () => {
  it('reads every request cookie for the request-scoped client', async () => {
    const event = createEvent()
    const { runtime } = createCookieRuntime()
    const methods = createAuthenticationCookieMethods(event, runtime)

    expect(await methods.getAll()).toEqual([
      { name: 'sb-project-auth-token', value: 'session-cookie' },
      { name: 'preference', value: 'compact' },
    ])
  })

  it('writes refreshed cookies and enforces private no-store headers', async () => {
    const event = createEvent()
    const { runtime, writtenCookies, writtenHeaders } = createCookieRuntime()
    const methods = createAuthenticationCookieMethods(event, runtime)

    await methods.setAll?.(
      [
        {
          name: 'sb-project-auth-token',
          options: { httpOnly: true, sameSite: 'lax' },
          value: 'refreshed-session',
        },
      ],
      { 'Cache-Control': 'public, max-age=3600' },
    )

    expect(writtenCookies).toEqual([
      {
        name: 'sb-project-auth-token',
        options: { httpOnly: true, sameSite: 'lax' },
        value: 'refreshed-session',
      },
    ])
    expect(writtenHeaders).toEqual([authenticationPrivateResponseHeaders])
  })

  it('detects only Supabase authentication cookies', () => {
    const event = createEvent()
    const { runtime } = createCookieRuntime()

    expect(hasAuthenticationCookie(event, runtime)).toBe(true)
    expect(
      hasAuthenticationCookie(event, {
        ...runtime,
        getAll: () => ({ preference: 'compact' }),
      }),
    ).toBe(false)
  })
})

describe('trusted server authentication resolution', () => {
  it('returns trusted identity from validated claims and prevents caching', async () => {
    const event = createEvent()
    const markResponsePrivate = vi.fn()
    const client = createClaimsClient({
      data: {
        claims: authenticatedClaims,
        header: { alg: 'RS256', kid: 'key-id', typ: 'JWT' },
        signature: new Uint8Array(),
      },
      error: null,
    })

    await expect(
      resolveAuthenticatedUser(event, {
        createClient: () => client,
        markResponsePrivate,
      }),
    ).resolves.toEqual({
      authenticated: true,
      user: {
        email: 'person@example.com',
        id: 'user-id',
      },
    })
    expect(markResponsePrivate).toHaveBeenCalledWith(event)
  })

  it('returns the consistent unauthenticated result when no session exists', async () => {
    const event = createEvent()

    await expect(
      resolveAuthenticatedUser(event, {
        createClient: () => createClaimsClient({ data: null, error: null }),
      }),
    ).resolves.toMatchObject({
      authenticated: false,
      error: { code: 'unauthenticated' },
    })
  })

  it('never treats anonymous claims as authenticated', async () => {
    const event = createEvent()

    await expect(
      resolveAuthenticatedUser(event, {
        createClient: () =>
          createClaimsClient({
            data: {
              claims: { ...authenticatedClaims, is_anonymous: true },
              header: { alg: 'RS256', kid: 'key-id', typ: 'JWT' },
              signature: new Uint8Array(),
            },
            error: null,
          }),
      }),
    ).resolves.toMatchObject({
      authenticated: false,
      error: { code: 'unauthenticated' },
    })
  })

  it('translates unusable sessions without exposing provider details', async () => {
    const event = createEvent()

    await expect(
      resolveAuthenticatedUser(event, {
        createClient: () =>
          createClaimsClient({
            data: null,
            error: {
              code: 'session_expired',
              message: 'Provider session internals',
            },
          }),
      }),
    ).resolves.toEqual({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })
  })

  it('normalizes thrown provider failures', async () => {
    const event = createEvent()
    const createClient = vi.fn(() => {
      throw { code: 'request_timeout', message: 'Provider internals' }
    }) as AuthenticationResolverDependencies['createClient']

    await expect(
      resolveAuthenticatedUser(event, { createClient }),
    ).resolves.toMatchObject({
      authenticated: false,
      error: { code: 'service-unavailable' },
    })
  })

  it('resolves authentication once per server request', async () => {
    const event = createEvent()
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: null })
    const client = {
      auth: { getClaims },
    } as unknown as Pick<SupabaseClient, 'auth'>
    const dependencies = { createClient: () => client }

    await Promise.all([
      resolveAuthenticatedUser(event, dependencies),
      resolveAuthenticatedUser(event, dependencies),
    ])

    expect(getClaims).toHaveBeenCalledTimes(1)
  })
})
