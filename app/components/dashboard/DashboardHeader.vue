<script setup lang="ts">
import type { DashboardSummary } from '~/types/dashboard'

const props = defineProps<{
  summary: DashboardSummary
}>()

const activeApplicationsLabel = computed(
  () =>
    `${props.summary.activeApplicationCount} active ${
      props.summary.activeApplicationCount === 1
        ? 'application'
        : 'applications'
    }`,
)

const interviewsLabel = computed(
  () =>
    `${props.summary.interviewCount} ${
      props.summary.interviewCount === 1 ? 'interview' : 'interviews'
    }`,
)
</script>

<template>
  <header
    class="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between"
  >
    <div>
      <p class="text-muted text-xs font-semibold tracking-[0.14em] uppercase">
        Your workspace
      </p>
      <h1
        class="mt-2 text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-[2.5rem]"
      >
        Welcome back, {{ summary.firstName }}.
      </h1>
      <p class="text-muted mt-2 text-base leading-7">
        {{ summary.message }}
      </p>

      <div class="mt-5 flex flex-wrap gap-2" aria-label="Application summary">
        <span
          class="border-line bg-panel text-muted inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium"
        >
          <span class="bg-accent size-1.5 rounded-full" aria-hidden="true" />
          {{ activeApplicationsLabel }}
        </span>
        <span
          class="border-line bg-panel text-muted inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium"
        >
          <span class="bg-accent size-1.5 rounded-full" aria-hidden="true" />
          {{ interviewsLabel }}
        </span>
      </div>
    </div>

    <button
      type="button"
      disabled
      class="bg-accent text-canvas inline-flex min-h-12 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold opacity-60"
      title="Application creation is not available in this checkpoint"
    >
      <span class="text-xl leading-none" aria-hidden="true">+</span>
      Create application
    </button>
  </header>
</template>
