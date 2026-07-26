<script setup lang="ts">
import { completeAuthenticationSignOut } from '~/utils/authentication/sign-out'
import type { AuthenticationSignOutResult } from '~~/shared/authentication/types'

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
  <div
    class="bg-canvas text-foreground min-h-dvh xl:grid xl:grid-cols-[13.5rem_minmax(0,1fr)]"
  >
    <ShellSidebar
      v-if="authenticatedUser"
      :email="authenticatedUser.email"
      :sign-out="signOut"
    />

    <div class="min-w-0">
      <slot />
    </div>
  </div>
</template>
