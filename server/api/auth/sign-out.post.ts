import type { AuthenticationSignOutResult } from '~~/shared/authentication/types'
import { signOutCurrentAuthenticationSession } from '../../utils/authentication/sign-out'

export default defineEventHandler(
  async (event): Promise<AuthenticationSignOutResult> => {
    const error = await signOutCurrentAuthenticationSession(event)

    if (error) {
      throw createError({
        data: { code: error.code },
        statusCode: error.code === 'service-unavailable' ? 503 : 500,
        statusMessage: 'Sign out could not be completed.',
      })
    }

    return { signedOut: true }
  },
)
