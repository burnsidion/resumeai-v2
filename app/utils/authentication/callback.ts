import { getAuthenticationErrorPageContent } from '~~/shared/authentication/error-pages'
import { getSafeInternalRedirect } from '~~/shared/authentication/redirects'
import type { AuthenticationCallbackRequest } from '~~/shared/authentication/schemas'
import type {
  AuthenticationCallbackResult,
  AuthenticationPageErrorCode,
  AuthenticationSessionState,
} from '~~/shared/authentication/types'

interface AuthenticationCallbackQuery {
  code?: unknown
  error?: unknown
  error_code?: unknown
  next?: unknown
}

export interface AuthenticationCallbackDependencies {
  navigate(destination: string): unknown
  resolveSession(): Promise<AuthenticationSessionState>
  showError(code: AuthenticationPageErrorCode): unknown
  submit(
    input: AuthenticationCallbackRequest,
  ): Promise<AuthenticationCallbackResult>
}

const getSingleQueryValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const getSafeErrorCode = (error: unknown): AuthenticationPageErrorCode => {
  if (typeof error !== 'object' || error === null) {
    return 'authentication-failed'
  }

  const responseData = (
    error as {
      data?: {
        data?: { code?: unknown }
      }
    }
  ).data?.data

  return getAuthenticationErrorPageContent(responseData?.code).code
}

export function createAuthenticationCallbackAttempt(
  query: AuthenticationCallbackQuery,
  dependencies: AuthenticationCallbackDependencies,
): () => Promise<void> {
  let attempt: Promise<void> | null = null
  const next = getSingleQueryValue(query.next)
  const authenticatedDestination = getSafeInternalRedirect(next, '/dashboard')

  const redirectAuthenticatedSession = async (): Promise<boolean> => {
    const session = await dependencies.resolveSession()

    if (!session.authenticated) {
      return false
    }

    await dependencies.navigate(authenticatedDestination)
    return true
  }

  const complete = async (): Promise<void> => {
    if (await redirectAuthenticatedSession()) {
      return
    }

    if (query.error || query.error_code) {
      await dependencies.showError('invalid-confirmation-link')
      return
    }

    const code = getSingleQueryValue(query.code)

    if (!code) {
      await dependencies.showError('invalid-confirmation-link')
      return
    }

    try {
      const result = await dependencies.submit({ code, next })

      if (!result.completed) {
        if (!(await redirectAuthenticatedSession())) {
          await dependencies.showError(result.errorCode)
        }

        return
      }

      const session = await dependencies.resolveSession()

      if (!session.authenticated) {
        await dependencies.showError('authentication-failed')
        return
      }

      await dependencies.navigate(result.redirectTo)
    } catch (error) {
      if (!(await redirectAuthenticatedSession())) {
        await dependencies.showError(getSafeErrorCode(error))
      }
    }
  }

  return () => {
    attempt ??= complete()
    return attempt
  }
}
