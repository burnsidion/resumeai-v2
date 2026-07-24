import type { AuthenticationPageErrorCode } from './types'

export interface AuthenticationErrorPageContent {
  code: AuthenticationPageErrorCode
  description: string
  title: string
}

const fallbackErrorCode: AuthenticationPageErrorCode = 'authentication-failed'

const errorPageContent: Record<
  AuthenticationPageErrorCode,
  AuthenticationErrorPageContent
> = {
  'authentication-failed': {
    code: 'authentication-failed',
    description:
      'We could not finish signing you in. Return to sign in and try again.',
    title: 'Authentication could not be completed',
  },
  'authentication-unavailable': {
    code: 'authentication-unavailable',
    description:
      'Authentication is temporarily unavailable. Please try again in a moment.',
    title: 'Authentication is unavailable',
  },
  'invalid-confirmation-link': {
    code: 'invalid-confirmation-link',
    description:
      'This confirmation link is invalid, expired, or has already been used.',
    title: 'This confirmation link did not work',
  },
}

const isAuthenticationPageErrorCode = (
  value: unknown,
): value is AuthenticationPageErrorCode =>
  typeof value === 'string' && value in errorPageContent

export function getAuthenticationErrorPageContent(
  code: unknown,
): AuthenticationErrorPageContent {
  const safeCode = isAuthenticationPageErrorCode(code)
    ? code
    : fallbackErrorCode

  return errorPageContent[safeCode]
}
