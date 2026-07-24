import { authenticationCallbackRequestSchema } from '~~/shared/authentication/schemas'
import { completeAuthenticationCallback } from '../../utils/authentication/callback'

export default defineEventHandler(async (event) => {
  const body = await readBody<unknown>(event)
  const input = authenticationCallbackRequestSchema.safeParse(body)

  if (!input.success) {
    throw createError({
      data: { code: 'invalid-confirmation-link' },
      statusCode: 400,
      statusMessage: 'Invalid authentication callback request.',
    })
  }

  const result = await completeAuthenticationCallback(event, input.data)

  if (!result.completed) {
    throw createError({
      data: { code: result.errorCode },
      statusCode: result.errorCode === 'authentication-unavailable' ? 503 : 400,
      statusMessage: 'Authentication could not be completed.',
    })
  }

  return result
})
