import { applicationIdSchema } from '../../../../shared/applications/constraints'
import {
  applicationWorkingCopyReviewResponseSchema,
  type ApplicationWorkingCopyReviewResponse,
  type TailoringReviewEndpointErrorCode,
} from '../../../../shared/tailoring/review'
import {
  ApplicationWorkingCopyReviewServiceError,
  loadApplicationWorkingCopyReview,
} from '../../../services/application-working-copy-review'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../utils/authentication/user'

const createReviewEndpointError = (
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
  error: ApplicationWorkingCopyReviewServiceError,
) => {
  if (error.kind === 'application-unavailable') {
    return createReviewEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'working-copy-unavailable') {
    return createReviewEndpointError(
      'working-copy-unavailable',
      404,
      'A working copy is unavailable for this application.',
    )
  }

  return createReviewEndpointError(
    'working-copy-review-unavailable',
    error.kind === 'inconsistent-state' ? 500 : 503,
    'The working-copy review is temporarily unavailable.',
  )
}

export default defineEventHandler(
  async (event): Promise<ApplicationWorkingCopyReviewResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createReviewEndpointError(
          'authentication-unavailable',
          503,
          'Working-copy review authentication is temporarily unavailable.',
        )
      }

      throw createReviewEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createReviewEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const review = await loadApplicationWorkingCopyReview(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return applicationWorkingCopyReviewResponseSchema.parse({ review })
    } catch (error) {
      if (error instanceof ApplicationWorkingCopyReviewServiceError) {
        throw toServiceEndpointError(error)
      }

      throw createReviewEndpointError(
        'working-copy-review-unavailable',
        500,
        'The working-copy review could not be loaded.',
      )
    }
  },
)
