<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-black/10 bg-white">
      <div class="mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <span class="text-lg font-semibold tracking-tight">
          {{ config.public.appName }}
        </span>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-16">
      <section aria-labelledby="foundation-heading" class="max-w-2xl">
        <p class="text-pine mb-3 text-sm font-medium tracking-widest uppercase">
          Foundation ready
        </p>
        <h1
          id="foundation-heading"
          class="text-4xl font-semibold tracking-tight"
        >
          Build every application with purpose.
        </h1>
        <p class="mt-5 max-w-xl text-lg leading-8 text-black/65">
          ResumAI V2 is a job application workspace built around clear
          ownership, truthful assistance, and durable application history.
        </p>
      </section>
    </main>
  </div>
</template>
