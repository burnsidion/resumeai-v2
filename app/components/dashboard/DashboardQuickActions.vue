<script setup lang="ts">
import type { DashboardQuickActionViewModel } from '~~/shared/dashboard/view-model'

defineProps<{
  actions: ReadonlyArray<DashboardQuickActionViewModel>
}>()
</script>

<template>
  <section
    class="bg-surface border-line h-full rounded-2xl border p-5 sm:p-6"
    aria-labelledby="quick-actions-heading"
  >
    <h2
      id="quick-actions-heading"
      class="text-lg font-semibold tracking-[-0.025em]"
    >
      Quick actions
    </h2>

    <ul class="mt-5 space-y-2.5">
      <li
        v-for="action in actions"
        :key="action.id"
        aria-disabled="true"
        class="border-line bg-panel/40 flex min-h-[4.25rem] items-center gap-3 rounded-xl border px-4 opacity-70"
        title="This action is not available in this checkpoint"
      >
        <span
          class="border-accent text-accent grid size-10 shrink-0 place-items-center rounded-xl border"
          aria-hidden="true"
        >
          <svg
            v-if="action.icon === 'create'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            class="size-5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <svg
            v-else-if="action.icon === 'upload'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-5"
          >
            <path d="m8 10 4-4 4 4M12 6v10" />
            <path d="M5 15v3h14v-3" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-5"
          >
            <path d="M8 6h12M8 12h12M8 18h12" />
            <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>

        <span class="min-w-0">
          <span class="block text-sm font-medium">{{ action.label }}</span>
          <span class="text-muted mt-0.5 block text-xs leading-5">
            {{ action.description }}
          </span>
        </span>
        <span class="sr-only">Not available yet</span>
      </li>
    </ul>
  </section>
</template>
