import type {
  BaseResumePreviewEndpointErrorCode,
  BaseResumePreviewResponse,
} from '../../../../shared/base-resumes/preview'
import {
  baseResumePreviewIdSchema,
  baseResumePreviewResponseSchema,
} from '../../../../shared/base-resumes/preview'
import {
  BaseResumePreviewServiceError,
  prepareBaseResumePreview,
} from '../../../services/prepare-base-resume-preview'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../utils/authentication/user'

const createBaseResumePreviewEndpointError = (
  code: BaseResumePreviewEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toServiceEndpointError = (error: BaseResumePreviewServiceError) => {
  if (error.kind === 'base-resume-unavailable') {
    return createBaseResumePreviewEndpointError(
      'base-resume-unavailable',
      404,
      'The base resume is unavailable.',
    )
  }

  const temporarilyUnavailable =
    error.kind === 'persistence-unavailable' ||
    error.kind === 'storage-unavailable'

  return createBaseResumePreviewEndpointError(
    'base-resume-preview-unavailable',
    temporarilyUnavailable ? 503 : 500,
    temporarilyUnavailable
      ? 'Base resume preview is temporarily unavailable.'
      : 'Base resume preview could not be prepared.',
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
        throw createBaseResumePreviewEndpointError(
          'authentication-unavailable',
          503,
          'Preview authentication is temporarily unavailable.',
        )
      }

      throw createBaseResumePreviewEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = baseResumePreviewIdSchema.safeParse(
      getRouterParam(event, 'id'),
    )

    if (!parsedId.success) {
      throw createBaseResumePreviewEndpointError(
        'invalid-base-resume-id',
        400,
        'A valid base resume ID is required.',
      )
    }

    let preview: Awaited<ReturnType<typeof prepareBaseResumePreview>>

    try {
      preview = await prepareBaseResumePreview(
        { client, userId: authentication.user.id },
        parsedId.data,
      )
    } catch (error) {
      if (error instanceof BaseResumePreviewServiceError) {
        throw toServiceEndpointError(error)
      }

      throw createBaseResumePreviewEndpointError(
        'base-resume-preview-unavailable',
        500,
        'Base resume preview could not be prepared.',
      )
    }

    try {
      return baseResumePreviewResponseSchema.parse({ preview })
    } catch {
      throw createBaseResumePreviewEndpointError(
        'base-resume-preview-unavailable',
        500,
        'Base resume preview could not be prepared.',
      )
    }
  },
)
