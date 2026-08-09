<script setup lang="ts">
import type { DashboardQuickActionViewModel } from '~~/shared/dashboard/view-model'

defineProps<{
  actions: ReadonlyArray<DashboardQuickActionViewModel>
}>()

const emit = defineEmits<{
  'upload-requested': []
}>()

const requestAction = (action: DashboardQuickActionViewModel): void => {
  if (
    action.availability === 'available' &&
    action.id === 'upload-base-resume'
  ) {
    emit('upload-requested')
  }
}

const getUnavailableTitle = (
  action: DashboardQuickActionViewModel,
): string | undefined => {
  if (action.availability === 'available') {
    return undefined
  }

  return action.id === 'upload-base-resume'
    ? 'All three active resume slots are in use'
    : 'This action is not available yet'
}
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
      <li v-for="action in actions" :key="action.id">
        <button
          type="button"
          :disabled="action.availability !== 'available'"
          :title="getUnavailableTitle(action)"
          class="border-line bg-panel/40 flex min-h-[4.25rem] w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 enabled:hover:border-cyan-300/45 enabled:hover:bg-cyan-300/5 disabled:cursor-not-allowed disabled:opacity-70"
          @click="requestAction(action)"
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
          <span v-if="action.availability === 'unavailable'" class="sr-only">
            Not available yet
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
