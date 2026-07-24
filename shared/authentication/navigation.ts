import { getSafeInternalRedirect } from './redirects'
import type { AuthenticationSessionState } from './types'

export interface AuthenticationRedirectLocation {
  path: string
  query?: Record<string, string>
}

export function getProtectedRouteRedirect(
  session: AuthenticationSessionState,
  requestedPath: unknown,
): AuthenticationRedirectLocation | null {
  if (session.authenticated) {
    return null
  }

  return {
    path: '/sign-in',
    query: {
      next: getSafeInternalRedirect(requestedPath, '/dashboard'),
    },
  }
}

export function getGuestRouteRedirect(
  session: AuthenticationSessionState,
): AuthenticationRedirectLocation | null {
  return session.authenticated ? { path: '/dashboard' } : null
}

export function getRootRouteRedirect(
  session: AuthenticationSessionState,
): AuthenticationRedirectLocation {
  return {
    path: session.authenticated ? '/dashboard' : '/sign-in',
  }
}
