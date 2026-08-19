import type {
  BaseResumeRetirementEndpointErrorCode,
  RetireBaseResumeResponse,
} from '../../../../shared/base-resumes/retirement'
import {
  baseResumeRetirementIdSchema,
  retireBaseResumeResponseSchema,
} from '../../../../shared/base-resumes/retirement'
import {
  BaseResumeRetirementServiceError,
  retireBaseResume,
} from '../../../services/retire-base-resume'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../utils/authentication/user'

const createBaseResumeRetirementEndpointError = (
  code: BaseResumeRetirementEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toServiceEndpointError = (error: BaseResumeRetirementServiceError) => {
  if (error.kind === 'base-resume-unavailable') {
    return createBaseResumeRetirementEndpointError(
      'base-resume-unavailable',
      404,
      'The base resume is unavailable.',
    )
  }

  const temporarilyUnavailable = error.kind === 'persistence-unavailable'

  return createBaseResumeRetirementEndpointError(
    'base-resume-retirement-unavailable',
    temporarilyUnavailable ? 503 : 500,
    temporarilyUnavailable
      ? 'Base resume retirement is temporarily unavailable.'
      : 'Base resume retirement could not be completed.',
  )
}

export default defineEventHandler(
  async (event): Promise<RetireBaseResumeResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createBaseResumeRetirementEndpointError(
          'authentication-unavailable',
          503,
          'Retirement authentication is temporarily unavailable.',
        )
      }

      throw createBaseResumeRetirementEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = baseResumeRetirementIdSchema.safeParse(
      getRouterParam(event, 'id'),
    )

    if (!parsedId.success) {
      throw createBaseResumeRetirementEndpointError(
        'invalid-base-resume-id',
        400,
        'A valid base resume ID is required.',
      )
    }

    let baseResume: Awaited<ReturnType<typeof retireBaseResume>>

    try {
      baseResume = await retireBaseResume(
        { client, userId: authentication.user.id },
        parsedId.data,
      )
    } catch (error) {
      if (error instanceof BaseResumeRetirementServiceError) {
        throw toServiceEndpointError(error)
      }

      throw createBaseResumeRetirementEndpointError(
        'base-resume-retirement-unavailable',
        500,
        'Base resume retirement could not be completed.',
      )
    }

    try {
      return retireBaseResumeResponseSchema.parse({ baseResume })
    } catch {
      throw createBaseResumeRetirementEndpointError(
        'base-resume-retirement-unavailable',
        500,
        'Base resume retirement could not be completed.',
      )
    }
  },
)
