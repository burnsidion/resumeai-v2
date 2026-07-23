import { hasAuthenticationCookie } from '../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../utils/authentication/user'

const excludedPathPrefixes = ['/_nuxt/', '/__nuxt_error']

export default defineEventHandler(async (event) => {
  if (
    excludedPathPrefixes.some((prefix) => event.path.startsWith(prefix)) ||
    !hasAuthenticationCookie(event)
  ) {
    return
  }

  await resolveAuthenticatedUser(event)
})
