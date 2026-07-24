<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <div
    class="bg-canvas text-foreground min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.95fr)]"
  >
    <aside
      class="bg-panel border-line relative hidden overflow-hidden border-r lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16 xl:py-14"
      aria-label="About ResumAI"
    >
      <div
        class="auth-grid pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <NuxtLink
        to="/sign-in"
        class="relative z-10 w-fit text-[1.0625rem] font-semibold tracking-[-0.02em]"
      >
        {{ config.public.appName }}
      </NuxtLink>

      <div class="relative z-10 max-w-xl pb-[10vh]">
        <p
          class="text-accent mb-5 text-xs font-semibold tracking-[0.18em] uppercase"
        >
          Your application workspace
        </p>
        <h2
          class="max-w-lg text-4xl leading-[1.08] font-semibold tracking-[-0.04em] xl:text-5xl"
        >
          A calmer way to move your job search forward.
        </h2>
        <p class="text-muted mt-6 max-w-lg text-base leading-7">
          Keep each opportunity, resume, and next step organized in one
          trustworthy workspace.
        </p>
      </div>

      <p class="text-muted relative z-10 text-sm">
        Thoughtful tools for a stressful process.
      </p>
    </aside>

    <div class="flex min-h-dvh flex-col">
      <header class="flex items-center justify-between px-6 py-6 lg:hidden">
        <NuxtLink
          to="/sign-in"
          class="text-base font-semibold tracking-[-0.02em]"
        >
          {{ config.public.appName }}
        </NuxtLink>
        <span class="text-muted text-xs tracking-[0.12em] uppercase">
          Secure access
        </span>
      </header>

      <main
        class="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12 lg:py-16"
      >
        <div class="w-full max-w-[29rem]">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
