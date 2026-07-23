import type { AuthenticationError, AuthenticationErrorCode } from './types'

interface ProviderErrorShape {
  code?: unknown
}

const providerErrorCodeMap: Record<string, AuthenticationErrorCode> = {
  bad_jwt: 'unauthenticated',
  email_exists: 'unknown',
  email_not_confirmed: 'email-not-confirmed',
  invalid_credentials: 'invalid-credentials',
  no_authorization: 'unauthenticated',
  over_email_send_rate_limit: 'rate-limited',
  over_request_rate_limit: 'rate-limited',
  refresh_token_already_used: 'unauthenticated',
  refresh_token_not_found: 'unauthenticated',
  request_timeout: 'service-unavailable',
  session_expired: 'unauthenticated',
  session_not_found: 'unauthenticated',
  unexpected_failure: 'service-unavailable',
  user_already_exists: 'unknown',
  weak_password: 'weak-password',
}

const errorMessages: Record<AuthenticationErrorCode, string> = {
  'email-not-confirmed': 'Confirm your email address before signing in.',
  'invalid-credentials': 'The email address or password is incorrect.',
  'rate-limited': 'Too many authentication attempts. Try again later.',
  'service-unavailable':
    'Authentication is temporarily unavailable. Try again later.',
  unauthenticated: 'Authentication is required.',
  unknown: 'Authentication could not be completed.',
  'weak-password': 'The password does not meet the security requirements.',
}

const getProviderCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const providerCode = (error as ProviderErrorShape).code

  return typeof providerCode === 'string' ? providerCode : null
}

export function createAuthenticationError(
  code: AuthenticationErrorCode,
): AuthenticationError {
  return {
    code,
    message: errorMessages[code],
  }
}

export function translateAuthenticationError(
  error: unknown,
): AuthenticationError {
  const providerCode = getProviderCode(error)
  const applicationCode = providerCode
    ? (providerErrorCodeMap[providerCode] ?? 'unknown')
    : 'unknown'

  return createAuthenticationError(applicationCode)
}
