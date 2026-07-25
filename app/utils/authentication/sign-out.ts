import { createAuthenticationError } from '~~/shared/authentication/errors'
import type {
  AuthenticationError,
  AuthenticationErrorCode,
  AuthenticationSessionState,
  AuthenticationSignOutResult,
} from '~~/shared/authentication/types'

export interface AuthenticationSignOutClientDependencies {
  navigateToSignIn(): Promise<unknown> | unknown
  requestSignOut(): Promise<AuthenticationSignOutResult>
  resolveSession(): Promise<AuthenticationSessionState>
}

const supportedSignOutErrorCodes: ReadonlySet<AuthenticationErrorCode> =
  new Set(['service-unavailable', 'unknown'])

const getSignOutError = (error: unknown): AuthenticationError => {
  if (typeof error !== 'object' || error === null) {
    return createAuthenticationError('unknown')
  }

  const responseCode = (
    error as {
      data?: {
        data?: { code?: unknown }
      }
    }
  ).data?.data?.code

  return createAuthenticationError(
    typeof responseCode === 'string' &&
      supportedSignOutErrorCodes.has(responseCode as AuthenticationErrorCode)
      ? (responseCode as AuthenticationErrorCode)
      : 'unknown',
  )
}

export async function completeAuthenticationSignOut(
  dependencies: AuthenticationSignOutClientDependencies,
): Promise<AuthenticationError | null> {
  let requestError: AuthenticationError | null = null

  try {
    const result = await dependencies.requestSignOut()

    if (!result.signedOut) {
      requestError = createAuthenticationError('unknown')
    }
  } catch (error) {
    requestError = getSignOutError(error)
  }

  const session = await dependencies.resolveSession()

  if (!session.authenticated) {
    await dependencies.navigateToSignIn()
    return null
  }

  return requestError ?? createAuthenticationError('unknown')
}
