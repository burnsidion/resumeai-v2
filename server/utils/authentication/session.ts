import type {
  AuthenticationResolution,
  AuthenticationSessionState,
} from '~~/shared/authentication/types'

export function toAuthenticationSessionState(
  resolution: AuthenticationResolution,
): AuthenticationSessionState {
  return resolution.authenticated
    ? {
        authenticated: true,
        user: resolution.user,
      }
    : {
        authenticated: false,
      }
}
