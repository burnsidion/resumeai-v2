import { markAuthenticationResponsePrivate } from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'
import { toAuthenticationSessionState } from '../../utils/authentication/session'

export default defineEventHandler(async (event) => {
  markAuthenticationResponsePrivate(event)

  return toAuthenticationSessionState(await resolveAuthenticatedUser(event))
})
