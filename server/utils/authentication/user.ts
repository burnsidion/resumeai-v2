import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

import {
  createAuthenticationError,
  translateAuthenticationError,
} from '~~/shared/authentication/errors'
import type { AuthenticationResolution } from '~~/shared/authentication/types'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from './supabase'

interface AuthenticationEventContext {
  authenticationResolution?: Promise<AuthenticationResolution>
}

export interface AuthenticationResolverDependencies {
  createClient?: (event: H3Event) => Pick<SupabaseClient, 'auth'>
  markResponsePrivate?: (event: H3Event) => void
}

const isTrustedAuthenticatedClaims = (claims: JwtPayload): boolean =>
  claims.sub.length > 0 &&
  claims.role === 'authenticated' &&
  claims.is_anonymous !== true

const resolveFromProvider = async (
  event: H3Event,
  dependencies: AuthenticationResolverDependencies,
): Promise<AuthenticationResolution> => {
  try {
    const client =
      dependencies.createClient?.(event) ??
      createAuthenticationServerClient(event)
    const { data, error } = await client.auth.getClaims()

    if (error) {
      return {
        authenticated: false,
        error: translateAuthenticationError(error),
      }
    }

    if (!data || !isTrustedAuthenticatedClaims(data.claims)) {
      return {
        authenticated: false,
        error: createAuthenticationError('unauthenticated'),
      }
    }

    const markResponsePrivate =
      dependencies.markResponsePrivate ?? markAuthenticationResponsePrivate

    markResponsePrivate(event)

    return {
      authenticated: true,
      user: {
        email: typeof data.claims.email === 'string' ? data.claims.email : null,
        id: data.claims.sub,
      },
    }
  } catch (error) {
    return {
      authenticated: false,
      error: translateAuthenticationError(error),
    }
  }
}

export function resolveAuthenticatedUser(
  event: H3Event,
  dependencies: AuthenticationResolverDependencies = {},
): Promise<AuthenticationResolution> {
  const context = event.context as AuthenticationEventContext

  context.authenticationResolution ??= resolveFromProvider(event, dependencies)

  return context.authenticationResolution
}
