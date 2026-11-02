import { applicationIdSchema } from '../../../../../shared/applications/constraints'
import { requestWorkingCopyRevisionSchema } from '../../../../../shared/tailoring/revision'
import {
  workingCopyLifecycleResponseSchema,
  type TailoringReviewEndpointErrorCode,
  type WorkingCopyLifecycleResponse,
} from '../../../../../shared/tailoring/review'
import {
  GenerateApplicationWorkingCopyError,
  generateApplicationWorkingCopy,
} from '../../../../services/generate-application-working-copy'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../../utils/authentication/user'

const createRevisionEndpointError = (
  code: TailoringReviewEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toServiceEndpointError = (error: GenerateApplicationWorkingCopyError) => {
  if (error.kind === 'application-unavailable') {
    return createRevisionEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'application-not-ready') {
    return createRevisionEndpointError(
      'working-copy-unavailable',
      409,
      'The current working copy can no longer be revised.',
    )
  }

  if (error.kind === 'operation-in-progress') {
    return createRevisionEndpointError(
      'tailoring-in-progress',
      409,
      'Tailoring is already in progress for this application.',
    )
  }

  if (error.kind === 'working-copy-immutable') {
    return createRevisionEndpointError(
      'working-copy-immutable',
      409,
      'The current working copy can no longer be revised.',
    )
  }

  if (error.kind === 'working-copy-unavailable') {
    return createRevisionEndpointError(
      'working-copy-unavailable',
      404,
      'A working copy is unavailable for this application.',
    )
  }

  return createRevisionEndpointError(
    'tailoring-unavailable',
    503,
    'AI tailoring is temporarily unavailable.',
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
        throw createRevisionEndpointError(
          'authentication-unavailable',
          503,
          'Revision authentication is temporarily unavailable.',
        )
      }

      throw createRevisionEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createRevisionEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    const parsedBody = requestWorkingCopyRevisionSchema.safeParse(
      await readBody(event),
    )

    if (!parsedBody.success) {
      throw createRevisionEndpointError(
        'invalid-revision-request',
        400,
        'A valid revision request is required.',
      )
    }

    try {
      const workingCopy = await generateApplicationWorkingCopy(
        { client, userId: authentication.user.id },
        parsedId.data,
        undefined,
        {
          mode: 'revision',
          revisionGuidance: parsedBody.data.guidance,
        },
      )

      return workingCopyLifecycleResponseSchema.parse({
        workingCopy: {
          ...workingCopy,
          state: 'awaiting_review',
        },
      })
    } catch (error) {
      if (error instanceof GenerateApplicationWorkingCopyError) {
        throw toServiceEndpointError(error)
      }

      throw createRevisionEndpointError(
        'tailoring-unavailable',
        500,
        'AI tailoring could not be completed.',
      )
    }
  },
)
