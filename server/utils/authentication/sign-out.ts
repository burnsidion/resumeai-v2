import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

import { translateAuthenticationError } from '~~/shared/authentication/errors'
import type { AuthenticationError } from '~~/shared/authentication/types'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from './supabase'

type AuthenticationSignOutClient = {
  auth: Pick<SupabaseClient['auth'], 'signOut'>
}

export interface AuthenticationSignOutDependencies {
  createClient?: (event: H3Event) => AuthenticationSignOutClient
  markResponsePrivate?: (event: H3Event) => void
}

export async function signOutCurrentAuthenticationSession(
  event: H3Event,
  dependencies: AuthenticationSignOutDependencies = {},
): Promise<AuthenticationError | null> {
  const markResponsePrivate =
    dependencies.markResponsePrivate ?? markAuthenticationResponsePrivate
  const createClient =
    dependencies.createClient ?? createAuthenticationServerClient

  markResponsePrivate(event)

  try {
    const client = createClient(event)
    const { error } = await client.auth.signOut({ scope: 'local' })

    return error ? translateAuthenticationError(error) : null
  } catch (error) {
    return translateAuthenticationError(error)
  }
}
