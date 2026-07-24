import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { SupabaseAuthenticationConfiguration } from '~~/shared/authentication/types'

export type BrowserSupabaseClientFactory = (
  supabaseUrl: string,
  supabasePublishableKey: string,
  options: {
    auth: {
      detectSessionInUrl: false
    }
  },
) => SupabaseClient

export function createAuthenticationBrowserClient(
  configuration: SupabaseAuthenticationConfiguration,
  clientFactory: BrowserSupabaseClientFactory = createBrowserClient,
): SupabaseClient {
  return clientFactory(
    configuration.supabaseUrl,
    configuration.supabasePublishableKey,
    {
      auth: {
        detectSessionInUrl: false,
      },
    },
  )
}
