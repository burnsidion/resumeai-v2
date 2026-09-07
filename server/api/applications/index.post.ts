import type { H3Event } from 'h3'

import type { ApplicationManagementEndpointErrorCode } from '../../../shared/applications/errors'
import { createApplicationRequestSchema } from '../../../shared/applications/management'
import type { ApplicationDetailResponse } from '../../../shared/applications/view-model'
import { createApplicationDetailResponse } from '../../presentation/application-management-view-model'
import {
  ApplicationManagementServiceError,
  createApplication,
} from '../../services/application-management'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

const createApplicationCreateEndpointError = (
  code: ApplicationManagementEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const readCreateApplicationRequest = async (event: H3Event) => {
  let body: unknown

  try {
    body = await readBody(event)
  } catch {
    throw createApplicationCreateEndpointError(
      'invalid-application',
      400,
      'A valid application is required.',
    )
  }

  const parsed = createApplicationRequestSchema.safeParse(body)

  if (!parsed.success) {
    throw createApplicationCreateEndpointError(
      'invalid-application',
      400,
      'A valid application is required.',
    )
  }

  return parsed.data
}

const toCreateServiceEndpointError = (
  error: ApplicationManagementServiceError,
) => {
  if (error.kind === 'selected-base-resume-unavailable') {
    return createApplicationCreateEndpointError(
      'selected-base-resume-unavailable',
      409,
      'The selected base resume is unavailable.',
    )
  }

  const temporarilyUnavailable = error.kind === 'persistence-unavailable'

  return createApplicationCreateEndpointError(
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
        throw createApplicationCreateEndpointError(
          'authentication-unavailable',
          503,
          'Application authentication is temporarily unavailable.',
        )
      }

      throw createApplicationCreateEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const input = await readCreateApplicationRequest(event)
    let application: Awaited<ReturnType<typeof createApplication>>

    try {
      application = await createApplication(
        { client, userId: authentication.user.id },
        input,
      )
    } catch (error) {
      if (error instanceof ApplicationManagementServiceError) {
        throw toCreateServiceEndpointError(error)
      }

      throw createApplicationCreateEndpointError(
        'application-save-unavailable',
        500,
        'The application could not be saved.',
      )
    }

    try {
      const response = createApplicationDetailResponse(application)

      event.node.res.statusCode = 201

      return response
    } catch {
      throw createApplicationCreateEndpointError(
        'application-save-unavailable',
        500,
        'The application could not be saved.',
      )
    }
  },
)
