<script setup lang="ts">
import { completeAuthenticationSignOut } from '~/utils/authentication/sign-out'
import type { AuthenticationSignOutResult } from '~~/shared/authentication/types'

definePageMeta({
  middleware: 'authenticated',
})

useHead({
  title: 'Dashboard · ResumAI',
})

const authentication = useAuthenticationState()
const authenticatedUser = computed(() =>
  authentication.session.value?.authenticated
    ? authentication.session.value.user
    : null,
)

const signOut = () =>
  completeAuthenticationSignOut({
    navigateToSignIn: () =>
      navigateTo('/sign-in', {
        replace: true,
      }),
    requestSignOut: () =>
      $fetch<AuthenticationSignOutResult>('/api/auth/sign-out', {
        method: 'POST',
      }),
    resolveSession: authentication.resolve,
  })
</script>

<template>
  <main
    class="bg-canvas text-foreground grid min-h-dvh place-items-center p-6 sm:p-8"
  >
    <AuthIdentity
      v-if="authenticatedUser"
      :email="authenticatedUser.email"
      :sign-out="signOut"
    />
  </main>
</template>
