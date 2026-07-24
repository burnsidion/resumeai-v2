<script setup lang="ts">
import { createAuthenticationCallbackAttempt } from '~/utils/authentication/callback'
import type { AuthenticationCallbackResult } from '~~/shared/authentication/types'

definePageMeta({
  layout: 'authentication',
})

useHead({
  title: 'Confirming your account · ResumAI',
})

const route = useRoute()
const authenticationState = useAuthenticationState()

const completeCallback = createAuthenticationCallbackAttempt(route.query, {
  navigate: (destination) => navigateTo(destination, { replace: true }),
  resolveSession: authenticationState.resolve,
  showError: (code) =>
    navigateTo(
      {
        path: '/auth/error',
        query: { code },
      },
      { replace: true },
    ),
  submit: (body) =>
    $fetch<AuthenticationCallbackResult>('/api/auth/callback', {
      body: {
        ...body,
      },
      method: 'POST',
    }),
})

onMounted(() => {
  void completeCallback()
})
</script>

<template>
  <AuthCard
    eyebrow="Secure sign in"
    title="Confirming your account"
    description="We are completing the secure handoff. This should only take a moment."
  >
    <div
      class="flex items-center gap-4"
      role="status"
      aria-live="polite"
      aria-label="Authentication is in progress"
    >
      <span
        class="auth-spinner border-accent/25 border-t-accent size-7 shrink-0 rounded-full border-[3px]"
        aria-hidden="true"
      />
      <p class="text-muted text-sm leading-6">
        Please keep this page open while we verify your session.
      </p>
    </div>
  </AuthCard>
</template>
