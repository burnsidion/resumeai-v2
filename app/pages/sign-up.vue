<script setup lang="ts">
import { translateAuthenticationError } from '~~/shared/authentication/errors'
import type { SignUpCredentials } from '~~/shared/authentication/schemas'
import type { AuthenticationError } from '~~/shared/authentication/types'
import { createEmailConfirmationRedirect } from '~~/shared/authentication/urls'

definePageMeta({
  layout: 'authentication',
  middleware: 'guest',
})

useHead({
  title: 'Create account · ResumAI',
})

const authenticationState = useAuthenticationState()
const pendingVerificationEmail = usePendingVerificationEmail()

const signUp = async (
  credentials: SignUpCredentials,
): Promise<AuthenticationError | null> => {
  const authenticationClient = useAuthenticationClient()
  const { data, error } = await authenticationClient.signUp({
    email: credentials.email,
    options: {
      emailRedirectTo: createEmailConfirmationRedirect(
        window.location.origin,
        '/dashboard',
      ),
    },
    password: credentials.password,
  })

  if (error) {
    return translateAuthenticationError(error)
  }

  if (data.session) {
    const session = await authenticationState.resolve()

    if (!session.authenticated) {
      return translateAuthenticationError({ code: 'session_not_found' })
    }

    await navigateTo('/dashboard', { replace: true })
    return null
  }

  pendingVerificationEmail.value = credentials.email
  await navigateTo('/auth/verify-email', { replace: true })

  return null
}
</script>

<template>
  <AuthCard
    eyebrow="Get started"
    title="Create your account"
    description="Set up your workspace now. You can add your first resume whenever you are ready."
  >
    <AuthSignUpForm :submit="signUp" />

    <template #footer>
      <p class="text-muted text-center text-sm">
        Already have an account?
        <NuxtLink
          to="/sign-in"
          class="text-accent hover:text-focus ml-1 font-semibold transition-colors"
        >
          Sign in
        </NuxtLink>
      </p>
    </template>
  </AuthCard>
</template>
