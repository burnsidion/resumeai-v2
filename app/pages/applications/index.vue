<script setup lang="ts">
import ApplicationsPageContent from '~/components/applications/ApplicationsPageContent.vue'

definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

useHead({
  title: 'Applications · ResumAI',
})

const { data: applications, refresh, status } = useApplications()

const openApplicationCreation = async (): Promise<void> => {
  await navigateTo('/applications/new')
}

const retryApplications = async (): Promise<void> => {
  await refresh()
}
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <ApplicationsPageContent
      v-if="applications"
      :applications="applications"
      @create-requested="openApplicationCreation"
    />

    <section
      v-else-if="status === 'error'"
      class="border-line bg-surface mx-auto flex min-h-96 max-w-3xl flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center"
      role="alert"
      aria-labelledby="applications-error-heading"
    >
      <span
        class="border-danger/30 bg-danger/7 text-danger grid size-16 place-items-center rounded-2xl border"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-7"
        >
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <p
        class="text-danger mt-6 text-xs font-semibold tracking-[0.14em] uppercase"
      >
        Something interrupted the request
      </p>
      <h1
        id="applications-error-heading"
        class="mt-3 text-2xl font-semibold tracking-[-0.035em]"
      >
        Applications unavailable
      </h1>
      <p class="text-muted mt-3 max-w-xl text-sm leading-7">
        We could not load your applications. Your information has not been
        changed. Try the request again.
      </p>
      <button
        type="button"
        class="border-line bg-raised text-foreground hover:bg-high focus-visible:outline-focus mt-6 min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
        @click="retryApplications"
      >
        Try again
      </button>
    </section>

    <section
      v-else
      aria-busy="true"
      aria-labelledby="applications-loading-heading"
    >
      <header class="max-w-3xl">
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Application workspace
        </p>
        <h1
          id="applications-loading-heading"
          class="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl"
        >
          Applications
        </h1>
        <p class="text-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
          Loading your saved opportunities.
        </p>
      </header>

      <div
        class="border-line bg-surface mt-10 rounded-2xl border p-4 sm:p-5"
        aria-hidden="true"
      >
        <div class="px-1 pb-4">
          <span class="bg-high block h-5 w-36 animate-pulse rounded-md" />
          <span class="bg-high mt-2 block h-3 w-44 animate-pulse rounded-md" />
        </div>
        <div class="grid gap-2">
          <span
            v-for="item in 3"
            :key="item"
            class="border-line bg-panel/35 block min-h-[5.25rem] animate-pulse rounded-xl border"
          />
        </div>
      </div>

      <span class="sr-only">Loading applications…</span>
    </section>
  </main>
</template>
