<script setup lang="ts">
import type {
  ApplicationTailoringRecovery,
  ApplicationTailoringRequestState,
} from '~/composables/useApplicationTailoring'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'

const props = defineProps<{
  application: ApplicationDetailViewModel
  requestState: ApplicationTailoringRequestState
}>()

const emit = defineEmits<{
  'recovery-requested': [recovery: ApplicationTailoringRecovery]
  'start-requested': []
}>()

const confirmationOpen = ref(false)
const headingId = useId()

const localRequestState = computed(() => {
  if (props.requestState.status === 'generating') {
    return 'generating'
  }

  if (props.requestState.status === 'failure') {
    return 'failure'
  }

  if (props.requestState.status === 'success') {
    return 'completed'
  }

  return null
})
const failure = computed(() =>
  props.requestState.status === 'failure' ? props.requestState.failure : null,
)
const missingRequirements = computed(
  () => props.application.readiness.missingRequirements,
)
const recoveryLabel = computed(() => {
  switch (failure.value?.recovery) {
    case 'back-to-applications':
      return 'Back to applications'
    case 'refresh-application':
      return 'Refresh application'
    case 'retry':
      return 'Try again'
    case 'review-details':
      return 'Review application details'
    case 'sign-in':
      return 'Return to sign in'
    default:
      return null
  }
})
const selectedResumeLabel = computed(
  () =>
    props.application.selectedBaseResume?.filename ?? 'your selected resume',
)

const requestStart = (): void => {
  confirmationOpen.value = false
  emit('start-requested')
}

const requestRecovery = (): void => {
  if (failure.value) {
    emit('recovery-requested', failure.value.recovery)
  }
}
</script>

<template>
  <section
    class="bg-surface border-line mt-8 rounded-2xl border p-5 sm:p-6"
    aria-label="Tailoring"
  >
    <template v-if="localRequestState === 'failure'">
      <p class="text-danger text-xs font-semibold tracking-[0.14em] uppercase">
        Tailoring needs attention
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        We couldn’t start a working copy
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
        {{ failure?.message }}
      </p>
      <p class="text-muted mt-2 max-w-2xl text-xs leading-5">
        Your application details and original PDF were not changed.
      </p>
      <button
        v-if="recoveryLabel"
        type="button"
        class="border-danger/30 bg-danger/10 text-danger hover:bg-danger/15 focus-visible:outline-focus mt-5 min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
        @click="requestRecovery"
      >
        {{ recoveryLabel }}
      </button>
    </template>

    <template v-else-if="localRequestState === 'generating'">
      <p class="text-accent text-xs font-semibold tracking-[0.14em] uppercase">
        Tailoring in progress
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        Preparing your working copy
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6" role="status">
        We’re comparing {{ selectedResumeLabel }} with this role and preparing a
        reviewable working copy. Your original PDF will not change.
      </p>
      <ol
        class="border-line bg-canvas/45 mt-5 grid gap-3 rounded-xl border p-4"
        aria-live="polite"
      >
        <li
          class="text-foreground flex items-center gap-3 text-xs font-semibold"
        >
          <span
            class="border-accent/25 border-t-accent size-4 shrink-0 rounded-full border-2 motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Preparing the selected resume
        </li>
        <li class="text-muted flex items-center gap-3 text-xs font-medium">
          <span
            class="bg-line size-2 shrink-0 rounded-full"
            aria-hidden="true"
          />
          Comparing it with this role
        </li>
        <li class="text-muted flex items-center gap-3 text-xs font-medium">
          <span
            class="bg-line size-2 shrink-0 rounded-full"
            aria-hidden="true"
          />
          Creating a reviewable working copy
        </li>
      </ol>
      <p class="text-muted mt-3 text-xs leading-5">
        This can take a moment. Keep this page open while it finishes.
      </p>
    </template>

    <template v-else-if="localRequestState === 'completed'">
      <p class="text-success text-xs font-semibold tracking-[0.14em] uppercase">
        Working copy created
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        Your working copy is ready
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
        We’ve saved a machine-generated working copy without changing your
        original PDF. Refresh the application to load its latest status.
      </p>
      <button
        type="button"
        class="border-line bg-panel hover:bg-raised focus-visible:outline-focus mt-5 min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
        @click="emit('recovery-requested', 'refresh-application')"
      >
        Refresh application
      </button>
    </template>

    <template v-else-if="application.tailoring.state === 'not-ready'">
      <p class="text-accent text-xs font-semibold tracking-[0.14em] uppercase">
        Preparation required
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        Add a little more context before tailoring
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
        Tailoring stays off until this application has the details needed to
        create a truthful working copy.
      </p>
      <ul class="mt-5 grid gap-2" aria-label="Required application details">
        <li
          v-for="requirement in missingRequirements"
          :key="requirement.id"
          class="text-muted flex items-center gap-2 text-sm"
        >
          <span
            class="border-accent/55 bg-accent/10 size-2 rounded-full border"
            aria-hidden="true"
          />
          {{ requirement.label }}
        </li>
      </ul>
      <button
        type="button"
        class="border-line bg-panel hover:bg-raised focus-visible:outline-focus mt-5 min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
        @click="emit('recovery-requested', 'review-details')"
      >
        Review details
      </button>
    </template>

    <template v-else-if="application.tailoring.state === 'processing'">
      <p class="text-accent text-xs font-semibold tracking-[0.14em] uppercase">
        Tailoring in progress
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        A working copy is already being prepared
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6" role="status">
        This application has an active tailoring request. Refresh when you’re
        ready to check its latest status; your original PDF remains unchanged.
      </p>
      <button
        type="button"
        class="border-line bg-panel hover:bg-raised focus-visible:outline-focus mt-5 min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
        @click="emit('recovery-requested', 'refresh-application')"
      >
        Refresh application
      </button>
    </template>

    <template v-else-if="application.tailoring.state === 'working-copy-ready'">
      <p class="text-success text-xs font-semibold tracking-[0.14em] uppercase">
        Working copy ready
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        Your reviewable working copy is saved
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
        A machine-generated working copy is ready for review. It remains
        separate from your original PDF until you decide what to do next.
      </p>
    </template>

    <template
      v-else-if="application.tailoring.state === 'working-copy-accepted'"
    >
      <p class="text-success text-xs font-semibold tracking-[0.14em] uppercase">
        Working copy accepted
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        This application has an accepted working copy
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
        The current working copy has already been accepted. Your original base
        resume remains unchanged.
      </p>
    </template>

    <template v-else>
      <p class="text-accent text-xs font-semibold tracking-[0.14em] uppercase">
        Ready to tailor
      </p>
      <h2 :id="headingId" class="mt-2 text-lg font-semibold tracking-[-0.02em]">
        Create a working copy for this role
      </h2>
      <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
        ResumAI will analyze {{ selectedResumeLabel }} against this job
        description and create a separate, reviewable working copy. It will
        never alter your original PDF.
      </p>

      <div
        v-if="confirmationOpen"
        class="border-accent/25 bg-accent/[0.055] mt-5 rounded-xl border p-4"
        role="region"
        aria-label="Confirm working copy creation"
      >
        <p class="text-sm font-semibold">Create this working copy?</p>
        <p class="text-muted mt-1 text-xs leading-5">
          This creates a machine-generated draft for review. It does not submit
          an application or change your base resume.
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            class="bg-accent text-canvas focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-opacity hover:opacity-90"
            @click="requestStart"
          >
            Create working copy
          </button>
          <button
            type="button"
            class="border-line bg-panel hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
            @click="confirmationOpen = false"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="bg-accent text-canvas focus-visible:outline-focus mt-5 min-h-11 rounded-xl px-5 text-sm font-semibold transition-opacity hover:opacity-90"
        @click="confirmationOpen = true"
      >
        Start tailoring
      </button>
    </template>
  </section>
</template>
