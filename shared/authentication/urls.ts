import { getSafeInternalRedirect } from './redirects'

export function createEmailConfirmationRedirect(
  origin: string,
  destination: unknown = '/dashboard',
): string {
  const callbackUrl = new URL('/auth/callback', origin)

  callbackUrl.searchParams.set(
    'next',
    getSafeInternalRedirect(destination, '/dashboard'),
  )

  return callbackUrl.toString()
}
