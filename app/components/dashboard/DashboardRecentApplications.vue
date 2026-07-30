<script setup lang="ts">
import type { DashboardRecentApplicationsViewModel } from '~~/shared/dashboard/view-model'

defineProps<{
  applications: DashboardRecentApplicationsViewModel
}>()

const statusClasses = {
  attention: 'border-accent/25 bg-accent/10 text-accent',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-line bg-high text-foreground',
  neutral: 'border-line bg-panel text-muted',
  success: 'border-success/25 bg-success/10 text-success',
} as const
</script>

<template>
  <section
    class="bg-surface border-line h-full rounded-2xl border p-5 sm:p-6"
    aria-labelledby="recent-applications-heading"
  >
    <div class="flex items-center justify-between gap-4">
      <h2
        id="recent-applications-heading"
        class="text-lg font-semibold tracking-[-0.025em]"
      >
        Recent applications
      </h2>
      <span class="text-accent/60 text-sm font-medium" aria-disabled="true">
        View all
        <span class="sr-only">Not available yet</span>
      </span>
    </div>

    <ul v-if="applications.items.length > 0" class="mt-5 space-y-2">
      <li
        v-for="application in applications.items"
        :key="application.id"
        class="border-line bg-panel/35 grid min-h-[4.25rem] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:px-4"
      >
        <span
          class="bg-high grid size-10 place-items-center rounded-lg text-sm font-semibold"
          aria-hidden="true"
        >
          {{ application.initial }}
        </span>
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">
            {{ application.role }}
          </span>
          <span class="text-muted mt-0.5 block truncate text-xs">
            {{ application.company }}
          </span>
        </span>
        <span
          class="hidden min-h-7 items-center rounded-lg border px-3 text-xs font-medium sm:inline-flex"
          :class="statusClasses[application.statusTone]"
        >
          {{ application.statusLabel }}
        </span>
        <time class="text-muted text-xs" :datetime="application.dateTime">
          {{ application.dateLabel }}
        </time>
      </li>
    </ul>

    <p
      v-else
      class="border-line text-muted mt-5 rounded-xl border border-dashed px-4 py-6 text-sm leading-6"
    >
      {{ applications.emptyMessage }}
    </p>
  </section>
</template>
