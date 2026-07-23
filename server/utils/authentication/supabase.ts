import {
  createServerClient,
  type CookieMethodsServer,
  type CookieOptions,
} from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

import type { SupabaseAuthenticationConfiguration } from '~~/shared/authentication/types'

export const authenticationPrivateResponseHeaders = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
} as const

export interface ServerCookieRuntime {
  getAll(event: H3Event): Record<string, string>
  set(event: H3Event, name: string, value: string, options: CookieOptions): void
  setHeaders(event: H3Event, headers: Record<string, string>): void
}

const defaultServerCookieRuntime: ServerCookieRuntime = {
  getAll: (event) => parseCookies(event),
  set: (event, name, value, options) => {
    setCookie(event, name, value, {
      ...options,
      path: options.path ?? '/',
    })
  },
  setHeaders: (event, headers) => setResponseHeaders(event, headers),
}

const getPrivateResponseHeaders = (
  headers: Record<string, string> = {},
): Record<string, string> => ({
  ...headers,
  ...authenticationPrivateResponseHeaders,
})

export function markAuthenticationResponsePrivate(
  event: H3Event,
  cookieRuntime: ServerCookieRuntime = defaultServerCookieRuntime,
): void {
  cookieRuntime.setHeaders(event, getPrivateResponseHeaders())
}

export function createAuthenticationCookieMethods(
  event: H3Event,
  cookieRuntime: ServerCookieRuntime = defaultServerCookieRuntime,
): CookieMethodsServer {
  return {
    getAll() {
      return Object.entries(cookieRuntime.getAll(event)).map(
        ([name, value]) => ({
          name,
          value,
        }),
      )
    },
    setAll(cookiesToSet, headers) {
      for (const { name, options, value } of cookiesToSet) {
        cookieRuntime.set(event, name, value, options)
      }

      cookieRuntime.setHeaders(event, getPrivateResponseHeaders(headers))
    },
  }
}

export function hasAuthenticationCookie(
  event: H3Event,
  cookieRuntime: ServerCookieRuntime = defaultServerCookieRuntime,
): boolean {
  return Object.keys(cookieRuntime.getAll(event)).some(
    (cookieName) =>
      cookieName.startsWith('sb-') && cookieName.includes('-auth-token'),
  )
}

export type ServerSupabaseClientFactory = (
  supabaseUrl: string,
  supabasePublishableKey: string,
  options: { cookies: CookieMethodsServer },
) => SupabaseClient

export interface CreateAuthenticationServerClientOptions {
  clientFactory?: ServerSupabaseClientFactory
  configuration?: SupabaseAuthenticationConfiguration
  cookieRuntime?: ServerCookieRuntime
}

const defaultServerClientFactory: ServerSupabaseClientFactory = (
  supabaseUrl,
  supabasePublishableKey,
  options,
) => createServerClient(supabaseUrl, supabasePublishableKey, options)

export function createAuthenticationServerClient(
  event: H3Event,
  options: CreateAuthenticationServerClientOptions = {},
): SupabaseClient {
  const configuration =
    options.configuration ?? getRuntimeSupabaseConfiguration(event)
  const clientFactory = options.clientFactory ?? defaultServerClientFactory

  return clientFactory(
    configuration.supabaseUrl,
    configuration.supabasePublishableKey,
    {
      cookies: createAuthenticationCookieMethods(event, options.cookieRuntime),
    },
  )
}

const getRuntimeSupabaseConfiguration = (
  event: H3Event,
): SupabaseAuthenticationConfiguration => {
  const runtimeConfig = useRuntimeConfig(event)

  return {
    supabasePublishableKey: runtimeConfig.public.supabasePublishableKey,
    supabaseUrl: runtimeConfig.public.supabaseUrl,
  }
}
