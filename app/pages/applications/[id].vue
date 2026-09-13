<script setup lang="ts">
import {
  applicationDetailResponseSchema,
  type ApplicationDetailResponse,
} from '~~/shared/applications/view-model'

definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

useHead({
  title: 'Application saved · ResumAI',
})

const route = useRoute()
const applicationId = Array.isArray(route.params.id)
  ? (route.params.id[0] ?? '')
  : (route.params.id ?? '')
const { data, refresh, status } = useFetch<ApplicationDetailResponse>(
  `/api/applications/${encodeURIComponent(applicationId)}`,
  {
    key: `application-confirmation-${applicationId}`,
    transform: (response) => applicationDetailResponseSchema.parse(response),
  },
)
const application = computed(() => data.value?.application ?? null)

const retryApplication = async (): Promise<void> => {
  await refresh()
}
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <section
      v-if="application"
      class="mx-auto max-w-3xl pt-[8vh]"
      aria-labelledby="application-confirmation-heading"
    >
      <div
        class="border-success/25 bg-success/[0.065] text-success grid size-14 place-items-center rounded-2xl border"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-7"
        >
          <path d="m5 12.5 4.2 4.2L19 7" />
        </svg>
      </div>

      <p
        class="text-success mt-6 text-xs font-semibold tracking-[0.14em] uppercase"
      >
        Application saved
      </p>
      <h1
        id="application-confirmation-heading"
        class="mt-2 text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-[2.5rem]"
      >
        {{ application.role }}
      </h1>
      <p class="text-muted mt-2 text-lg">{{ application.company }}</p>

      <div
        class="bg-surface border-line mt-8 grid gap-5 rounded-2xl border p-5 sm:grid-cols-2 sm:p-6"
      >
        <div>
          <p class="text-muted text-xs font-medium">Tracking status</p>
          <p class="mt-1 text-sm font-semibold">
            {{ application.statusLabel }}
          </p>
        </div>
        <div>
          <p class="text-muted text-xs font-medium">Tailoring preparation</p>
          <p class="mt-1 text-sm font-semibold">
            {{ application.readiness.label }}
          </p>
        </div>
        <div class="sm:col-span-2">
          <p class="text-muted text-xs font-medium">Base resume</p>
          <p class="mt-1 text-sm font-semibold">
            {{ application.selectedBaseResume?.filename ?? 'Not selected' }}
          </p>
        </div>
      </div>

      <p class="text-muted mt-6 max-w-2xl text-sm leading-6">
        Your application was saved as a draft. Tailoring has not started and
        will run only when you explicitly request it in a later workflow.
      </p>

      <button
        type="button"
        class="bg-accent text-canvas focus-visible:outline-focus mt-8 min-h-11 rounded-xl px-5 text-sm font-semibold transition-opacity hover:opacity-90"
        @click="navigateTo('/applications')"
      >
        Back to applications
      </button>
    </section>

    <section
      v-else-if="status === 'error'"
      class="bg-surface border-line mx-auto mt-[8vh] max-w-2xl rounded-2xl border p-6 sm:p-8"
      role="alert"
      aria-labelledby="application-confirmation-error-heading"
    >
      <p class="text-danger text-xs font-semibold tracking-[0.14em] uppercase">
        Application unavailable
      </p>
      <h1
        id="application-confirmation-error-heading"
        class="mt-2 text-2xl font-semibold tracking-[-0.03em]"
      >
        We couldn’t load this application
      </h1>
      <p class="text-muted mt-3 text-sm leading-6">
        The application may no longer be available, or its details could not be
        loaded right now.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          class="bg-accent text-canvas focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold"
          @click="retryApplication"
        >
          Try again
        </button>
        <button
          type="button"
          class="border-line bg-panel hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="navigateTo('/applications')"
        >
          Back to applications
        </button>
      </div>
    </section>

    <section
      v-else
      class="bg-surface border-line mx-auto mt-[8vh] max-w-2xl rounded-2xl border p-6 sm:p-8"
      aria-live="polite"
      aria-busy="true"
    >
      <h1 class="text-2xl font-semibold tracking-[-0.03em]">
        Loading your application
      </h1>
      <p class="text-muted mt-3 text-sm leading-6">
        Confirming the saved details now.
      </p>
    </section>
  </main>
</template>
