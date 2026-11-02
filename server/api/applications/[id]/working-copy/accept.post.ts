import { applicationIdSchema } from '../../../../../shared/applications/constraints'
import {
  workingCopyLifecycleResponseSchema,
  type TailoringReviewEndpointErrorCode,
  type WorkingCopyLifecycleResponse,
} from '../../../../../shared/tailoring/review'
import {
  acceptApplicationWorkingCopy,
  ApplicationWorkingCopyLifecycleError,
} from '../../../../services/application-working-copy-lifecycle'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../../utils/authentication/user'

const createAcceptEndpointError = (
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
    return createAcceptEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'working-copy-unavailable') {
    return createAcceptEndpointError(
      'working-copy-unavailable',
      404,
      'A working copy is unavailable for this application.',
    )
  }

  if (error.kind === 'working-copy-immutable') {
    return createAcceptEndpointError(
      'working-copy-immutable',
      409,
      'The current working copy has already been accepted.',
    )
  }

  return createAcceptEndpointError(
    'working-copy-lifecycle-unavailable',
    503,
    'The working copy could not be accepted.',
  )
}

export default defineEventHandler(
  async (event): Promise<WorkingCopyLifecycleResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createAcceptEndpointError(
          'authentication-unavailable',
          503,
          'Acceptance authentication is temporarily unavailable.',
        )
      }

      throw createAcceptEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createAcceptEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const workingCopy = await acceptApplicationWorkingCopy(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return workingCopyLifecycleResponseSchema.parse({ workingCopy })
    } catch (error) {
      if (error instanceof ApplicationWorkingCopyLifecycleError) {
        throw toServiceEndpointError(error)
      }

      throw createAcceptEndpointError(
        'working-copy-lifecycle-unavailable',
        500,
        'The working copy could not be accepted.',
      )
    }
  },
)
