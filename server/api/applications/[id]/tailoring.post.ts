import { applicationIdSchema } from '../../../../shared/applications/constraints'
import {
  generateApplicationWorkingCopyResponseSchema,
  type GenerateApplicationWorkingCopyResponse,
  type TailoringGenerationEndpointErrorCode,
} from '../../../../shared/tailoring/generation'
import {
  GenerateApplicationWorkingCopyError,
  generateApplicationWorkingCopy,
} from '../../../services/generate-application-working-copy'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../../utils/authentication/user'

const createTailoringEndpointError = (
  code: TailoringGenerationEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const toTailoringServiceEndpointError = (
  error: GenerateApplicationWorkingCopyError,
) => {
  if (error.kind === 'application-unavailable') {
    return createTailoringEndpointError(
      'application-unavailable',
      404,
      'The application is unavailable.',
    )
  }

  if (error.kind === 'application-not-ready') {
    return createTailoringEndpointError(
      'application-not-ready',
      409,
      'Add a job description and active base resume before tailoring.',
    )
  }

  if (error.kind === 'operation-in-progress') {
    return createTailoringEndpointError(
      'tailoring-in-progress',
      409,
      'Tailoring is already in progress for this application.',
    )
  }

  if (error.kind === 'working-copy-immutable') {
    return createTailoringEndpointError(
      'working-copy-immutable',
      409,
      'The current working copy can no longer be replaced.',
    )
  }

  return createTailoringEndpointError(
    'tailoring-unavailable',
    503,
    'AI tailoring is temporarily unavailable.',
  )
}

export default defineEventHandler(
  async (event): Promise<GenerateApplicationWorkingCopyResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createTailoringEndpointError(
          'authentication-unavailable',
          503,
          'Tailoring authentication is temporarily unavailable.',
        )
      }

      throw createTailoringEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    const parsedId = applicationIdSchema.safeParse(getRouterParam(event, 'id'))

    if (!parsedId.success) {
      throw createTailoringEndpointError(
        'invalid-application-id',
        400,
        'A valid application ID is required.',
      )
    }

    try {
      const workingCopy = await generateApplicationWorkingCopy(
        { client, userId: authentication.user.id },
        parsedId.data,
      )

      return generateApplicationWorkingCopyResponseSchema.parse({
        workingCopy,
      })
    } catch (error) {
      if (error instanceof GenerateApplicationWorkingCopyError) {
        throw toTailoringServiceEndpointError(error)
      }

      throw createTailoringEndpointError(
        'tailoring-unavailable',
        500,
        'AI tailoring could not be completed.',
      )
    }
  },
)
