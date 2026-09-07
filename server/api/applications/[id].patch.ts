import type { H3Event } from 'h3'

import { applicationIdSchema } from '../../../shared/applications/constraints'
import type { ApplicationManagementEndpointErrorCode } from '../../../shared/applications/errors'
import { updateApplicationRequestSchema } from '../../../shared/applications/management'
import type { ApplicationDetailResponse } from '../../../shared/applications/view-model'
import { createApplicationDetailResponse } from '../../presentation/application-management-view-model'
import {
  ApplicationManagementServiceError,
  updateApplication,
} from '../../services/application-management'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

const createApplicationUpdateEndpointError = (
  code: ApplicationManagementEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const readUpdateApplicationRequest = async (event: H3Event) => {
  let body: unknown

  try {
    body = await readBody(event)
  } catch {
    throw createApplicationUpdateEndpointError(
      'invalid-application',
      400,
      'A valid application update is required.',
    )
  }

  const parsed = updateApplicationRequestSchema.safeParse(body)

  if (!parsed.success) {
    throw createApplicationUpdateEndpointError(
      'invalid-application',
      400,
      'A valid application update is required.',
    )
  }

  return parsed.data
}

const toUpdateServiceEndpointError = (
  error: ApplicationManagementServiceError,
) => {
  if (error.kind === 'application-unavailable') {
    return createApplicationUpdateEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'selected-base-resume-unavailable') {
    return createApplicationUpdateEndpointError(
      'selected-base-resume-unavailable',
      409,
      'The selected base resume is unavailable.',
    )
  }

  const temporarilyUnavailable = error.kind === 'persistence-unavailable'

  return createApplicationUpdateEndpointError(
    'application-save-unavailable',
    temporarilyUnavailable ? 503 : 500,
    temporarilyUnavailable
      ? 'Application saving is temporarily unavailable.'
      : 'The application could not be saved.',
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
        throw createApplicationUpdateEndpointError(
          'authentication-unavailable',
          503,
          'Application authentication is temporarily unavailable.',
        )
      }

      throw createApplicationUpdateEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createApplicationUpdateEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    const input = await readUpdateApplicationRequest(event)

    try {
      const application = await updateApplication(
        { client, userId: authentication.user.id },
        parsedId.data,
        input,
      )

      return createApplicationDetailResponse(application)
    } catch (error) {
      if (error instanceof ApplicationManagementServiceError) {
        throw toUpdateServiceEndpointError(error)
      }

      throw createApplicationUpdateEndpointError(
        'application-save-unavailable',
        500,
        'The application could not be saved.',
      )
    }
  },
)
