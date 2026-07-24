<script setup lang="ts">
definePageMeta({
  layout: 'authentication',
})

useHead({
  title: 'Check your email · ResumAI',
})

const pendingVerificationEmail = usePendingVerificationEmail()
</script>

<template>
  <AuthCard
    eyebrow="One more step"
    title="Check your email"
    description="Use the confirmation link in your inbox to finish creating your account."
  >
    <div class="space-y-5">
      <AuthNotice
        :message="
          pendingVerificationEmail
            ? `We sent a confirmation link to ${pendingVerificationEmail}.`
            : 'We sent a confirmation link to the email address you used.'
        "
        tone="success"
      />

      <p class="text-muted text-sm leading-6">
        The link can only be used once. If it has expired, return to account
        creation and try again.
      </p>

      <NuxtLink
        to="/sign-in"
        class="bg-accent text-canvas hover:bg-focus flex h-[3.125rem] w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors"
      >
        Return to sign in
      </NuxtLink>
    </div>
  </AuthCard>
</template>
