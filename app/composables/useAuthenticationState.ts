import type { AuthenticationSessionState } from '~~/shared/authentication/types'

export function useAuthenticationState() {
  const session = useState<AuthenticationSessionState | null>(
    'authentication-session',
    () => null,
  )

  const resolve = async (): Promise<AuthenticationSessionState> => {
    try {
      const requestFetch = import.meta.server ? useRequestFetch() : $fetch
      session.value =
        await requestFetch<AuthenticationSessionState>('/api/auth/session')
    } catch {
      session.value = { authenticated: false }
    }

    return session.value
  }

  return {
    resolve,
    session: readonly(session),
  }
}
