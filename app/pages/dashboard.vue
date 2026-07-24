<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated',
})

useHead({
  title: 'Authenticated · ResumAI',
})
</script>

<template>
  <main class="bg-canvas text-foreground grid min-h-dvh place-items-center p-6">
    <p class="text-muted text-sm">Authenticated route placeholder</p>
  </main>
</template>
