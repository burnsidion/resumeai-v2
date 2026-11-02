import { applicationIdSchema } from '../../../../../shared/applications/constraints'
import {
  baseResumePreviewResponseSchema,
  type BaseResumePreviewResponse,
} from '../../../../../shared/base-resumes/preview'
import type { TailoringReviewEndpointErrorCode } from '../../../../../shared/tailoring/review'
import {
  ApplicationWorkingCopySourcePreviewServiceError,
  prepareApplicationWorkingCopySourcePreview,
} from '../../../../services/prepare-application-working-copy-source-preview'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../../utils/authentication/user'

const createPreviewEndpointError = (
  code: TailoringReviewEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toServiceEndpointError = (
  error: ApplicationWorkingCopySourcePreviewServiceError,
) => {
  if (error.kind === 'application-unavailable') {
    return createPreviewEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'working-copy-unavailable') {
    return createPreviewEndpointError(
      'working-copy-unavailable',
      404,
      'A working copy is unavailable for this application.',
    )
  }

  return createPreviewEndpointError(
    'working-copy-review-unavailable',
    error.kind === 'inconsistent-state' ? 500 : 503,
    'The source-resume preview is temporarily unavailable.',
  )
}

export default defineEventHandler(
  async (event): Promise<BaseResumePreviewResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createPreviewEndpointError(
          'authentication-unavailable',
          503,
          'Working-copy preview authentication is temporarily unavailable.',
        )
      }

      throw createPreviewEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createPreviewEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const preview = await prepareApplicationWorkingCopySourcePreview(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return baseResumePreviewResponseSchema.parse({ preview })
    } catch (error) {
      if (error instanceof ApplicationWorkingCopySourcePreviewServiceError) {
        throw toServiceEndpointError(error)
      }

      throw createPreviewEndpointError(
        'working-copy-review-unavailable',
        500,
        'The source-resume preview could not be prepared.',
      )
    }
  },
)
