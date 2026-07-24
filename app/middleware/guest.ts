import { getGuestRouteRedirect } from '~~/shared/authentication/navigation'

export default defineNuxtRouteMiddleware(async () => {
  const authentication = useAuthenticationState()
  const session = await authentication.resolve()
  const redirect = getGuestRouteRedirect(session)

  if (redirect) {
    return navigateTo(redirect, { replace: true })
  }
})
