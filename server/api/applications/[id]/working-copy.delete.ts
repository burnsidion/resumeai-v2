import { applicationIdSchema } from '../../../../shared/applications/constraints'
import {
  discardWorkingCopyResponseSchema,
  type DiscardWorkingCopyResponse,
  type TailoringReviewEndpointErrorCode,
} from '../../../../shared/tailoring/review'
import {
  ApplicationWorkingCopyLifecycleError,
  discardApplicationWorkingCopy,
} from '../../../services/application-working-copy-lifecycle'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../utils/authentication/user'

const createDiscardEndpointError = (
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
  error: ApplicationWorkingCopyLifecycleError,
) => {
  if (error.kind === 'application-unavailable') {
    return createDiscardEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'working-copy-unavailable') {
    return createDiscardEndpointError(
      'working-copy-unavailable',
      404,
      'A working copy is unavailable for this application.',
    )
  }

  if (error.kind === 'working-copy-immutable') {
    return createDiscardEndpointError(
      'working-copy-immutable',
      409,
      'The current working copy has already been accepted.',
    )
  }

  return createDiscardEndpointError(
    'working-copy-lifecycle-unavailable',
    503,
    'The working copy could not be discarded.',
  )
}

export default defineEventHandler(
  async (event): Promise<DiscardWorkingCopyResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createDiscardEndpointError(
          'authentication-unavailable',
          503,
          'Discard authentication is temporarily unavailable.',
        )
      }

      throw createDiscardEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createDiscardEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const discardedWorkingCopyId = await discardApplicationWorkingCopy(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return discardWorkingCopyResponseSchema.parse({ discardedWorkingCopyId })
    } catch (error) {
      if (error instanceof ApplicationWorkingCopyLifecycleError) {
        throw toServiceEndpointError(error)
      }

      throw createDiscardEndpointError(
        'working-copy-lifecycle-unavailable',
        500,
        'The working copy could not be discarded.',
      )
    }
  },
)
