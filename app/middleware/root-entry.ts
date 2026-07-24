import { getRootRouteRedirect } from '~~/shared/authentication/navigation'

export default defineNuxtRouteMiddleware(async () => {
  const authentication = useAuthenticationState()
  const session = await authentication.resolve()

  return navigateTo(getRootRouteRedirect(session), { replace: true })
})
