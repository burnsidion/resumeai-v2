import { applicationIdSchema } from '../../../shared/applications/constraints'
import type { DeleteApplicationResponse } from '../../../shared/applications/deletion'
import type { ApplicationManagementEndpointErrorCode } from '../../../shared/applications/errors'
import {
  ApplicationManagementServiceError,
  deleteApplication,
} from '../../services/application-management'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

const createApplicationDeletionEndpointError = (
  code: ApplicationManagementEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toDeletionServiceEndpointError = (
  error: ApplicationManagementServiceError,
) => {
  if (error.kind === 'application-unavailable') {
    return createApplicationDeletionEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  const temporarilyUnavailable = error.kind === 'persistence-unavailable'

  return createApplicationDeletionEndpointError(
    'application-deletion-unavailable',
    temporarilyUnavailable ? 503 : 500,
    temporarilyUnavailable
      ? 'Application deletion is temporarily unavailable.'
      : 'The application could not be deleted.',
  )
}

export default defineEventHandler(
  async (event): Promise<DeleteApplicationResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createApplicationDeletionEndpointError(
          'authentication-unavailable',
          503,
          'Application authentication is temporarily unavailable.',
        )
      }

      throw createApplicationDeletionEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createApplicationDeletionEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const deletedId = await deleteApplication(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return { application: { id: deletedId } }
    } catch (error) {
      if (error instanceof ApplicationManagementServiceError) {
        throw toDeletionServiceEndpointError(error)
      }

      throw createApplicationDeletionEndpointError(
        'application-deletion-unavailable',
        500,
        'The application could not be deleted.',
      )
    }
  },
)
