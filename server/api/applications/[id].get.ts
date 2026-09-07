import { applicationIdSchema } from '../../../shared/applications/constraints'
import type { ApplicationManagementEndpointErrorCode } from '../../../shared/applications/errors'
import type { ApplicationDetailResponse } from '../../../shared/applications/view-model'
import { createApplicationDetailResponse } from '../../presentation/application-management-view-model'
import {
  ApplicationManagementServiceError,
  loadApplication,
} from '../../services/application-management'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

const createApplicationDetailEndpointError = (
  code: ApplicationManagementEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toLoadServiceEndpointError = (
  error: ApplicationManagementServiceError,
) => {
  if (error.kind === 'application-unavailable') {
    return createApplicationDetailEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  const temporarilyUnavailable = error.kind === 'persistence-unavailable'

  return createApplicationDetailEndpointError(
    'applications-unavailable',
    temporarilyUnavailable ? 503 : 500,
    temporarilyUnavailable
      ? 'Applications are temporarily unavailable.'
      : 'The application could not be loaded.',
  )
}

export default defineEventHandler(
  async (event): Promise<ApplicationDetailResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createApplicationDetailEndpointError(
          'authentication-unavailable',
          503,
          'Application authentication is temporarily unavailable.',
        )
      }

      throw createApplicationDetailEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createApplicationDetailEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const application = await loadApplication(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return createApplicationDetailResponse(application)
    } catch (error) {
      if (error instanceof ApplicationManagementServiceError) {
        throw toLoadServiceEndpointError(error)
      }

      throw createApplicationDetailEndpointError(
        'applications-unavailable',
        500,
        'The application could not be loaded.',
      )
    }
  },
)
