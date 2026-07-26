<script setup lang="ts">
import type {
  DashboardFollowUp,
  DashboardRecentApplication,
} from '~/types/dashboard'

defineProps<{
  applications: ReadonlyArray<DashboardRecentApplication>
  followUp?: DashboardFollowUp
}>()

const statusClasses = {
  attention: 'border-accent/25 bg-accent/10 text-accent',
  info: 'border-line bg-high text-foreground',
  neutral: 'border-line bg-panel text-muted',
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

    <ul class="mt-5 space-y-2">
      <li
        v-for="application in applications"
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
          {{ application.status }}
        </span>
        <time class="text-muted text-xs" :datetime="application.dateTime">
          {{ application.date }}
        </time>
      </li>
    </ul>

    <div
      v-if="followUp"
      class="border-line text-muted mt-3 flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs"
    >
      <span class="bg-danger size-2 shrink-0 rounded-full" aria-hidden="true" />
      <span class="font-medium">{{ followUp.label }}</span>
      <span aria-hidden="true">·</span>
      <span class="truncate">{{ followUp.context }}</span>
    </div>
  </section>
</template>
