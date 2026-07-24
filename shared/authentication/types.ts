export interface SupabaseAuthenticationConfiguration {
  supabasePublishableKey: string
  supabaseUrl: string
}

export type AuthenticationErrorCode =
  | 'email-not-confirmed'
  | 'invalid-credentials'
  | 'rate-limited'
  | 'service-unavailable'
  | 'unauthenticated'
  | 'unknown'
  | 'weak-password'

export interface AuthenticationError {
  code: AuthenticationErrorCode
  message: string
}

export interface AuthenticatedUser {
  email: string | null
  id: string
}

export type AuthenticationResolution =
  | {
      authenticated: true
      user: AuthenticatedUser
    }
  | {
      authenticated: false
      error: AuthenticationError
    }

export type AuthenticationSessionState =
  | {
      authenticated: true
      user: AuthenticatedUser
    }
  | {
      authenticated: false
    }

export type AuthenticationPageErrorCode =
  | 'authentication-failed'
  | 'authentication-unavailable'
  | 'invalid-confirmation-link'

export type AuthenticationCallbackResult =
  | {
      completed: true
      redirectTo: string
    }
  | {
      completed: false
      errorCode: AuthenticationPageErrorCode
    }
