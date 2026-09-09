<script setup lang="ts">
import type {
  ApplicationReadiness,
  ApplicationReadinessRequirement,
} from '~~/shared/applications/management'

const props = defineProps<{
  readiness: ApplicationReadiness
}>()

const headingId = useId()
const missingRequirements = computed<
  ReadonlySet<ApplicationReadinessRequirement>
>(() => new Set(props.readiness.missingRequirements))
const requirements = computed(() => [
  {
    description: 'Needed to understand the role',
    id: 'job-description' as const,
    label: 'Job description added',
    missingLabel: 'Add a job description',
    satisfied: !missingRequirements.value.has('job-description'),
  },
  {
    description: 'Needed as the source of truth',
    id: 'base-resume' as const,
    label: 'Base resume selected',
    missingLabel: 'Choose a base resume',
    satisfied: !missingRequirements.value.has('base-resume'),
  },
])
</script>

<template>
  <section
    class="bg-surface border-line rounded-2xl border p-5 sm:p-6"
    :class="
      readiness.isReady ? 'border-success/25 bg-success/[0.035]' : undefined
    "
    :aria-labelledby="headingId"
  >
    <p
      class="text-xs font-semibold tracking-[0.14em] uppercase"
      :class="readiness.isReady ? 'text-success' : 'text-accent'"
    >
      {{ readiness.isReady ? 'Preparation complete' : 'Preparation' }}
    </p>
    <h2 :id="headingId" class="mt-2 text-base font-semibold tracking-[-0.02em]">
      {{ readiness.isReady ? 'Ready after saving' : 'Save now, prepare later' }}
    </h2>
    <p class="text-muted mt-2 text-xs leading-5">
      <template v-if="readiness.isReady">
        Saving creates a ready draft. Tailoring will still begin only when you
        explicitly request it.
      </template>
      <template v-else>
        This draft can be saved now. The items below are optional for creation
        and required only before tailoring.
      </template>
    </p>

    <ul class="mt-4 grid gap-3">
      <li
        v-for="requirement in requirements"
        :key="requirement.id"
        class="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2.5"
      >
        <svg
          v-if="requirement.satisfied"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-success mt-0.5 size-4"
          aria-hidden="true"
        >
          <path d="m5 12.5 4.2 4.2L19 7" />
        </svg>
        <span
          v-else
          class="border-accent/50 bg-accent/10 mt-1 ml-1 size-2 rounded-full border"
          aria-hidden="true"
        />
        <span>
          <strong class="block text-xs font-semibold">
            {{
              requirement.satisfied
                ? requirement.label
                : requirement.missingLabel
            }}
          </strong>
          <span class="text-muted mt-1 block text-[0.6875rem] leading-4">
            {{ requirement.description }}
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
