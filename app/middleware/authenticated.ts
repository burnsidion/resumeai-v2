import { getProtectedRouteRedirect } from '~~/shared/authentication/navigation'

export default defineNuxtRouteMiddleware(async (to) => {
  const authentication = useAuthenticationState()
  const session = await authentication.resolve()
  const redirect = getProtectedRouteRedirect(session, to.fullPath)

  if (!redirect) {
    return
  }

  return navigateTo(redirect, { replace: true })
})
