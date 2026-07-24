<script setup lang="ts">
import { getAuthenticationErrorPageContent } from '~~/shared/authentication/error-pages'

definePageMeta({
  layout: 'authentication',
})

useHead({
  title: 'Authentication error · ResumAI',
})

const route = useRoute()
const content = computed(() =>
  getAuthenticationErrorPageContent(route.query.code),
)
</script>

<template>
  <AuthCard
    eyebrow="Something went wrong"
    :title="content.title"
    :description="content.description"
  >
    <div class="space-y-4">
      <AuthNotice
        message="For your security, this page only displays a general error."
        tone="info"
      />
      <NuxtLink
        to="/sign-in"
        class="bg-accent text-canvas hover:bg-focus flex h-[3.125rem] w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors"
      >
        Return to sign in
      </NuxtLink>
    </div>
  </AuthCard>
</template>
