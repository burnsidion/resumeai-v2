<script setup lang="ts">
import type { DashboardReadyForReview } from '~/types/dashboard'

defineProps<{
  item: DashboardReadyForReview
}>()
</script>

<template>
  <section
    class="bg-surface border-line relative h-full overflow-hidden rounded-2xl border p-6 sm:p-8"
    aria-labelledby="ready-for-review-heading"
  >
    <div class="bg-accent absolute inset-y-0 left-0 w-1" aria-hidden="true" />

    <div class="flex flex-wrap items-center gap-3">
      <p class="text-accent text-xs font-semibold tracking-[0.14em] uppercase">
        {{ item.eyebrow }}
      </p>
      <span
        class="border-success/20 bg-success/10 text-success inline-flex min-h-7 items-center rounded-lg border px-2.5 text-xs font-medium"
      >
        {{ item.status }}
      </span>
    </div>

    <div class="mt-6 flex items-start gap-5">
      <div
        class="border-accent text-accent hidden size-20 shrink-0 place-items-center rounded-2xl border sm:grid"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-11"
        >
          <path d="M10 5h18l10 10v28H10z" />
          <path d="M28 5v11h11" />
          <circle cx="32" cy="34" r="9" class="fill-surface" />
          <path d="m28 34 3 3 6-7" />
        </svg>
      </div>

      <div class="min-w-0">
        <h2
          id="ready-for-review-heading"
          class="text-2xl leading-tight font-semibold tracking-[-0.03em]"
        >
          {{ item.role }}
        </h2>
        <p class="text-muted mt-1 text-lg">{{ item.company }}</p>
        <p class="text-muted mt-4 max-w-xl text-sm leading-6">
          {{ item.description }}
        </p>
      </div>
    </div>

    <div class="mt-7 flex flex-wrap gap-3">
      <button
        type="button"
        disabled
        class="bg-accent text-canvas min-h-11 cursor-not-allowed rounded-xl px-5 text-sm font-semibold opacity-60"
        title="Working-copy review is not available in this checkpoint"
      >
        {{ item.primaryActionLabel }}
      </button>
      <button
        type="button"
        disabled
        class="text-accent min-h-11 cursor-not-allowed rounded-xl px-4 text-sm font-semibold opacity-60"
        title="Application details are not available in this checkpoint"
      >
        {{ item.secondaryActionLabel }}
      </button>
    </div>
  </section>
</template>
