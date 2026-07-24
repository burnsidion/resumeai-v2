<script setup lang="ts">
import { translateAuthenticationError } from '~~/shared/authentication/errors'
import { getSafeInternalRedirect } from '~~/shared/authentication/redirects'
import type { SignInCredentials } from '~~/shared/authentication/schemas'
import type { AuthenticationError } from '~~/shared/authentication/types'

definePageMeta({
  layout: 'authentication',
  middleware: 'guest',
})

useHead({
  title: 'Sign in · ResumAI',
})

const route = useRoute()
const authenticationState = useAuthenticationState()

const signIn = async (
  credentials: SignInCredentials,
): Promise<AuthenticationError | null> => {
  const authenticationClient = useAuthenticationClient()
  const { error } = await authenticationClient.signInWithPassword(credentials)

  if (error) {
    return translateAuthenticationError(error)
  }

  const session = await authenticationState.resolve()

  if (!session.authenticated) {
    return translateAuthenticationError({ code: 'session_not_found' })
  }

  await navigateTo(getSafeInternalRedirect(route.query.next, '/dashboard'), {
    replace: true,
  })

  return null
}
</script>

<template>
  <AuthCard
    eyebrow="Welcome back"
    title="Sign in to ResumAI"
    description="Pick up where you left off and keep your job search moving."
  >
    <AuthSignInForm :submit="signIn" />

    <template #footer>
      <p class="text-muted text-center text-sm">
        New to ResumAI?
        <NuxtLink
          to="/sign-up"
          class="text-accent hover:text-focus ml-1 font-semibold transition-colors"
        >
          Create an account
        </NuxtLink>
      </p>
    </template>
  </AuthCard>
</template>
