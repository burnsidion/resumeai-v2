import type { ApplicationManagementEndpointErrorCode } from '../../../shared/applications/errors'
import type { ApplicationListViewModel } from '../../../shared/applications/view-model'
import { createApplicationListViewModel } from '../../presentation/application-management-view-model'
import {
  ApplicationManagementServiceError,
  listApplications,
} from '../../services/application-management'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

const createApplicationListEndpointError = (
  code: ApplicationManagementEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

export default defineEventHandler(
  async (event): Promise<ApplicationListViewModel> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createApplicationListEndpointError(
          'authentication-unavailable',
          503,
          'Application authentication is temporarily unavailable.',
        )
      }

      throw createApplicationListEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    try {
      const applications = await listApplications({
        client,
        userId: authentication.user.id,
      })

      return createApplicationListViewModel(applications)
    } catch (error) {
      const temporarilyUnavailable =
        error instanceof ApplicationManagementServiceError &&
        error.kind === 'persistence-unavailable'

      throw createApplicationListEndpointError(
        'applications-unavailable',
        temporarilyUnavailable ? 503 : 500,
        temporarilyUnavailable
          ? 'Applications are temporarily unavailable.'
          : 'Applications could not be loaded.',
      )
    }
  },
)
