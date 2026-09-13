<script setup lang="ts">
import ApplicationListItem from '~/components/applications/ApplicationListItem.vue'
import type { ApplicationListViewModel } from '~~/shared/applications/view-model'

const props = defineProps<{
  applications: ApplicationListViewModel
}>()

const emit = defineEmits<{
  'create-requested': []
}>()

const applicationCountLabel = computed(() => {
  const count = props.applications.applications.length

  return `${count} ${count === 1 ? 'application' : 'applications'}`
})
</script>

<template>
  <section aria-labelledby="applications-page-heading">
    <header
      class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="max-w-3xl">
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Application workspace
        </p>
        <h1
          id="applications-page-heading"
          class="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl"
        >
          Applications
        </h1>
        <p class="text-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
          Keep each opportunity, next step, and resume source together in one
          calm workspace.
        </p>
      </div>

      <button
        v-if="applications.applications.length > 0"
        type="button"
        class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors"
        @click="emit('create-requested')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          class="size-4"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create application
      </button>
    </header>

    <section
      v-if="applications.applications.length > 0"
      class="border-line bg-surface mt-10 rounded-2xl border p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.03),0_26px_70px_rgb(0_0_0/0.18)] sm:p-5"
      aria-labelledby="owned-applications-heading"
    >
      <div class="flex items-end justify-between gap-5 px-1 pb-4">
        <div>
          <h2
            id="owned-applications-heading"
            class="text-lg font-semibold tracking-[-0.025em]"
          >
            Your applications
          </h2>
          <p class="text-muted mt-1 text-xs">Most recently updated first</p>
        </div>
        <span class="text-muted shrink-0 text-xs">
          {{ applicationCountLabel }}
        </span>
      </div>

      <div
        class="text-muted/65 hidden grid-cols-[minmax(15rem,1.6fr)_minmax(6.5rem,0.62fr)_minmax(9.5rem,0.85fr)_minmax(4.5rem,0.42fr)] gap-4 px-4 pb-2 text-[0.625rem] font-semibold tracking-[0.09em] uppercase xl:grid"
        aria-hidden="true"
      >
        <span>Opportunity</span>
        <span>Status</span>
        <span>Tailoring</span>
        <span>Updated</span>
      </div>

      <ul class="grid list-none gap-2 p-0">
        <li
          v-for="application in applications.applications"
          :key="application.id"
          class="min-w-0"
        >
          <ApplicationListItem :application="application" />
        </li>
      </ul>
    </section>

    <section
      v-else
      class="border-accent/25 bg-surface/70 mt-10 flex min-h-[31rem] flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-12 text-center"
      aria-labelledby="applications-empty-heading"
    >
      <span
        class="border-accent/35 bg-accent/7 text-accent grid size-[4.5rem] place-items-center rounded-2xl border shadow-xl shadow-black/25"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-9"
        >
          <rect x="7" y="10" width="34" height="27" rx="5" />
          <path d="M17 10V7.5A3.5 3.5 0 0 1 20.5 4h7A3.5 3.5 0 0 1 31 7.5V10" />
          <path d="M7 22c5.3 2.5 11 3.7 17 3.7s11.7-1.2 17-3.7" />
          <path d="M24 18v9M19.5 22.5h9" />
        </svg>
      </span>
      <p
        class="text-accent mt-6 text-xs font-semibold tracking-[0.14em] uppercase"
      >
        Your search, organized
      </p>
      <h2
        id="applications-empty-heading"
        class="mt-3 text-2xl font-semibold tracking-[-0.035em]"
      >
        Create your first application
      </h2>
      <p class="text-muted mt-3 max-w-xl text-sm leading-7">
        Save the role information you have now. You can add a base resume and
        begin tailoring later, whenever you are ready.
      </p>
      <button
        type="button"
        class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors"
        @click="emit('create-requested')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          class="size-4"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create application
      </button>
      <p class="text-muted mt-4 text-xs">
        Company and role are all you need to begin.
      </p>
    </section>
  </section>
</template>
