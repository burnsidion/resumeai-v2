<script setup lang="ts">
import type { ApplicationListItemViewModel } from '~~/shared/applications/view-model'

const props = defineProps<{
  application: ApplicationListItemViewModel
}>()

const statusClasses = {
  attention: 'border-accent/25 bg-accent/10 text-accent',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-line bg-high text-foreground',
  neutral: 'border-line bg-panel text-muted',
  success: 'border-success/25 bg-success/10 text-success',
} as const

const companyInitial = computed(
  () =>
    Array.from(props.application.company.trim())[0]?.toLocaleUpperCase(
      'en-US',
    ) ?? '?',
)

const readinessLabel = computed(() => {
  if (props.application.readiness.isReady) {
    return props.application.readiness.label
  }

  return (
    props.application.readiness.missingRequirements[0]?.label ??
    props.application.readiness.label
  )
})
</script>

<template>
  <NuxtLink
    :to="`/applications/${application.id}`"
    :aria-label="`Open ${application.role} at ${application.company}`"
    class="border-line bg-panel/35 hover:border-accent/40 hover:bg-raised focus-visible:outline-focus relative grid min-h-32 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-4 pr-10 transition-[border-color,background-color,transform] hover:-translate-y-px lg:min-h-[5.25rem] lg:grid-cols-[minmax(13rem,1.35fr)_auto_minmax(9.5rem,0.85fr)] lg:gap-4 xl:grid-cols-[minmax(15rem,1.6fr)_minmax(6.5rem,0.62fr)_minmax(9.5rem,0.85fr)_minmax(4.5rem,0.42fr)]"
  >
    <span class="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
      <span
        class="bg-accent/10 text-accent border-accent/20 grid size-11 shrink-0 place-items-center rounded-xl border text-sm font-semibold"
        aria-hidden="true"
      >
        {{ companyInitial }}
      </span>
      <span class="min-w-0">
        <strong class="block truncate text-sm font-semibold tracking-[-0.01em]">
          {{ application.role }}
        </strong>
        <span class="text-muted mt-1 block truncate text-xs">
          {{ application.company }}
        </span>
      </span>
    </span>

    <span
      class="inline-flex min-h-7 w-fit items-center rounded-lg border px-3 text-xs font-medium"
      :class="statusClasses[application.statusTone]"
    >
      {{ application.statusLabel }}
    </span>

    <span
      class="border-line text-muted col-span-2 flex items-center gap-2 border-t pt-3 text-xs leading-5 lg:col-span-1 lg:border-0 lg:pt-0"
      :class="{ 'text-success': application.readiness.isReady }"
    >
      <span
        class="size-1.5 shrink-0 rounded-full bg-current opacity-70"
        aria-hidden="true"
      />
      {{ readinessLabel }}
    </span>

    <time
      class="text-muted hidden text-xs xl:block"
      :datetime="application.updatedAt"
    >
      {{ application.updatedLabel }}
    </time>

    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="text-muted absolute top-1/2 right-4 size-4 -translate-y-1/2"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  </NuxtLink>
</template>
