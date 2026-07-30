<script setup lang="ts">
import type { DashboardBaseResumesViewModel } from '~~/shared/dashboard/view-model'

defineProps<{
  resumes: DashboardBaseResumesViewModel
}>()
</script>

<template>
  <section
    class="bg-surface border-line h-full rounded-2xl border p-5 sm:p-6"
    aria-labelledby="base-resumes-heading"
  >
    <div class="flex items-center justify-between gap-4">
      <h2
        id="base-resumes-heading"
        class="text-lg font-semibold tracking-[-0.025em]"
      >
        Base resumes
      </h2>
      <span class="text-muted text-xs">{{ resumes.countLabel }}</span>
    </div>

    <p
      v-if="resumes.emptyMessage"
      class="border-line text-muted mt-5 rounded-xl border border-dashed px-4 py-6 text-sm leading-6"
    >
      {{ resumes.emptyMessage }}
    </p>

    <ul class="mt-5 space-y-2">
      <li
        v-for="resume in resumes.items"
        :key="resume.id"
        class="border-line bg-panel/35 grid min-h-[4.25rem] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 sm:px-4"
      >
        <span
          class="border-line text-muted grid size-10 place-items-center rounded-lg border"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-5"
          >
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v5h5M9 13h6M9 17h6" />
          </svg>
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">
            {{ resume.filename }}
          </span>
          <span class="text-muted mt-0.5 block text-xs">
            {{ resume.addedLabel }}
          </span>
        </span>
        <span
          class="text-success inline-flex items-center gap-2 text-xs font-medium"
        >
          <span class="size-2 rounded-full bg-current" aria-hidden="true" />
          {{ resume.statusLabel }}
        </span>
      </li>

      <li
        v-if="resumes.remainingSlots > 0"
        class="border-line text-muted flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-dashed px-3 sm:px-4"
      >
        <span
          class="border-line grid size-10 place-items-center rounded-lg border text-xl"
          aria-hidden="true"
        >
          +
        </span>
        <span class="text-sm">{{ resumes.remainingSlotsLabel }}</span>
      </li>
    </ul>
  </section>
</template>
