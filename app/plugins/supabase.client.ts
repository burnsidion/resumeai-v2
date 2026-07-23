import { createAuthenticationBrowserClient } from '~/utils/authentication/supabase'

export default defineNuxtPlugin(() => {
  const runtimeConfig = useRuntimeConfig()
  const supabase = createAuthenticationBrowserClient({
    supabasePublishableKey: runtimeConfig.public.supabasePublishableKey,
    supabaseUrl: runtimeConfig.public.supabaseUrl,
  })

  return {
    provide: {
      authenticationClient: supabase.auth,
    },
  }
})
