import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

import { translateAuthenticationError } from '~~/shared/authentication/errors'
import { getSafeInternalRedirect } from '~~/shared/authentication/redirects'
import type { AuthenticationCallbackRequest } from '~~/shared/authentication/schemas'
import type {
  AuthenticationCallbackResult,
  AuthenticationPageErrorCode,
} from '~~/shared/authentication/types'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from './supabase'

type AuthenticationCodeExchangeClient = {
  auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession'>
}

export interface AuthenticationCallbackDependencies {
  createClient?: (event: H3Event) => AuthenticationCodeExchangeClient
  markResponsePrivate?: (event: H3Event) => void
}

const getCallbackErrorCode = (error: unknown): AuthenticationPageErrorCode =>
  translateAuthenticationError(error).code === 'service-unavailable'
    ? 'authentication-unavailable'
    : 'invalid-confirmation-link'

export async function completeAuthenticationCallback(
  event: H3Event,
  input: AuthenticationCallbackRequest,
  dependencies: AuthenticationCallbackDependencies = {},
): Promise<AuthenticationCallbackResult> {
  const markResponsePrivate =
    dependencies.markResponsePrivate ?? markAuthenticationResponsePrivate
  const createClient =
    dependencies.createClient ?? createAuthenticationServerClient

  markResponsePrivate(event)

  try {
    const client = createClient(event)
    const { error } = await client.auth.exchangeCodeForSession(input.code)

    if (error) {
      return {
        completed: false,
        errorCode: getCallbackErrorCode(error),
      }
    }

    return {
      completed: true,
      redirectTo: getSafeInternalRedirect(input.next, '/dashboard'),
    }
  } catch (error) {
    return {
      completed: false,
      errorCode: getCallbackErrorCode(error),
    }
  }
}
