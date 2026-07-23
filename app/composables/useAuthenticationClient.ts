import type { SupabaseClient } from '@supabase/supabase-js'

export type BrowserAuthenticationClient = SupabaseClient['auth']

export function useAuthenticationClient(): BrowserAuthenticationClient {
  if (import.meta.server) {
    throw new Error(
      'The browser authentication client is not available during server execution.',
    )
  }

  return useNuxtApp().$authenticationClient
}
