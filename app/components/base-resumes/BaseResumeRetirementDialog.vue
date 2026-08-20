<script setup lang="ts">
import type { BaseResumeRetirementRecovery } from '~/composables/useBaseResumeRetirement'
import type { RetiredBaseResume } from '~~/shared/base-resumes/retirement'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const props = defineProps<{
  open: boolean
  resume: BaseResumeManagementItemViewModel
}>()

const emit = defineEmits<{
  close: []
  'recovery-requested': [recovery: 'refresh' | 'sign-in']
  retired: [baseResume: RetiredBaseResume]
}>()

const dialog = useTemplateRef<HTMLElement>('dialog')
const headingId = useId()
const descriptionId = useId()
const retirement = useBaseResumeRetirement()
let dialogActive = false
let previousBodyOverflow = ''
let previousFocus: HTMLElement | null = null

const canDismiss = computed(() => !retirement.isBusy.value)
const failure = computed(() =>
  retirement.state.value.status === 'failure'
    ? retirement.state.value.failure
    : null,
)

const getFocusableElements = (): HTMLElement[] =>
  Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ) ?? [],
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  )

const requestClose = (): void => {
  if (canDismiss.value) {
    emit('close')
  }
}

const handleDocumentKeydown = (event: KeyboardEvent): void => {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusableElements = getFocusableElements()

  if (focusableElements.length === 0) {
    event.preventDefault()
    dialog.value?.focus()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements.at(-1)
  const activeElement = document.activeElement

  if (
    event.shiftKey &&
    (activeElement === firstElement || !dialog.value?.contains(activeElement))
  ) {
    event.preventDefault()
    lastElement?.focus()
  } else if (
    !event.shiftKey &&
    (activeElement === lastElement || !dialog.value?.contains(activeElement))
  ) {
    event.preventDefault()
    firstElement?.focus()
  }
}

const activateDialog = async (): Promise<void> => {
  if (dialogActive) {
    return
  }

  dialogActive = true
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleDocumentKeydown)

  await nextTick()

  if (props.open && dialogActive) {
    dialog.value?.focus()
  }
}

const deactivateDialog = (): void => {
  if (!dialogActive) {
    return
  }

  dialogActive = false
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.body.style.overflow = previousBodyOverflow
  retirement.reset()

  const focusTarget = previousFocus
  previousFocus = null

  if (focusTarget?.isConnected) {
    nextTick(() => focusTarget.focus())
  }
}

const submitRetirement = async (): Promise<void> => {
  const retiredResume = retirement.canRetry.value
    ? await retirement.retry()
    : await retirement.retire(props.resume.id)

  if (retiredResume) {
    emit('retired', retiredResume)
  }
}

const requestRecovery = (recovery: BaseResumeRetirementRecovery): void => {
  if (recovery === 'refresh' || recovery === 'sign-in') {
    emit('recovery-requested', recovery)
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void activateDialog()
    } else {
      deactivateDialog()
    }
  },
)

onMounted(() => {
  if (props.open) {
    void activateDialog()
  }
})

onBeforeUnmount(deactivateDialog)
</script>

<template>
  <div
    v-if="open"
    class="bg-canvas/85 fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4 backdrop-blur-sm sm:p-6"
    @click.self="requestClose"
  >
    <section
      ref="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="headingId"
      :aria-describedby="descriptionId"
      :aria-busy="retirement.isBusy.value || undefined"
      tabindex="-1"
      class="bg-panel border-line auth-elevation relative my-auto w-full max-w-lg rounded-2xl border p-5 outline-none sm:p-7"
    >
      <span
        class="border-danger/25 bg-danger/[0.06] text-danger grid size-12 place-items-center rounded-xl border"
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

      <header class="mt-5">
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Base resumes
        </p>
        <h2
          :id="headingId"
          class="mt-2 text-2xl font-semibold tracking-[-0.035em]"
        >
          Retire this base resume?
        </h2>
        <p :id="descriptionId" class="text-muted mt-3 text-sm leading-7">
          <strong class="text-foreground font-semibold break-words">
            {{ resume.filename }}
          </strong>
          will no longer be available for new applications or tailoring.
          {{ resume.slotLabel }} will become available.
        </p>
      </header>

      <div
        class="border-line bg-surface/65 text-muted mt-5 grid grid-cols-[1rem_minmax(0,1fr)] gap-3 rounded-xl border p-4 text-xs leading-5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-accent mt-0.5 size-4"
          aria-hidden="true"
        >
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <span>
          <strong class="text-foreground block font-semibold">
            The original PDF stays preserved.
          </strong>
          Historical application references will remain unchanged.
        </span>
      </div>

      <div
        v-if="retirement.state.value.status === 'retiring'"
        class="border-accent/30 bg-accent/[0.045] mt-5 rounded-xl border px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p class="flex items-center gap-3 text-sm font-medium">
          <span
            class="auth-spinner border-muted border-t-accent size-4 rounded-full border-2 motion-reduce:animate-none"
            aria-hidden="true"
          />
          Retiring base resume…
        </p>
        <p class="text-muted mt-1 pl-7 text-xs">
          Keep this window open until the result is confirmed.
        </p>
      </div>

      <div
        v-else-if="retirement.state.value.status === 'success'"
        class="border-success/30 bg-success/[0.06] mt-5 rounded-xl border px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p class="text-success text-sm font-semibold">Retirement confirmed</p>
        <p class="text-muted mt-1 text-sm leading-6">
          The active slot can now be used by another base resume.
        </p>
      </div>

      <div
        v-else-if="failure"
        class="border-danger/30 bg-danger/[0.055] mt-5 rounded-xl border px-4 py-3"
        role="alert"
      >
        <p class="text-sm font-semibold">Resume retirement needs attention</p>
        <p class="text-muted mt-1 text-sm leading-6">
          {{ failure.message }}
        </p>
      </div>

      <footer
        class="border-line mt-6 flex flex-wrap justify-end gap-3 border-t pt-5"
      >
        <button
          v-if="retirement.state.value.status !== 'success'"
          type="button"
          class="border-line text-foreground hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canDismiss"
          @click="requestClose"
        >
          Cancel
        </button>

        <button
          v-if="
            failure?.recovery === 'refresh' || failure?.recovery === 'sign-in'
          "
          type="button"
          class="border-line text-foreground hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
          @click="requestRecovery(failure.recovery)"
        >
          {{
            failure.recovery === 'sign-in'
              ? 'Return to sign in'
              : 'Refresh resumes'
          }}
        </button>

        <button
          v-if="retirement.state.value.status === 'idle'"
          type="button"
          class="border-danger/30 bg-danger/12 text-danger hover:bg-danger/18 focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="submitRetirement"
        >
          Retire resume
        </button>

        <button
          v-else-if="retirement.state.value.status === 'retiring'"
          type="button"
          class="border-danger/20 bg-danger/8 text-danger min-h-11 rounded-xl border px-5 text-sm font-semibold opacity-60"
          disabled
        >
          Retiring resume…
        </button>

        <button
          v-else-if="retirement.canRetry.value"
          type="button"
          class="border-danger/30 bg-danger/12 text-danger hover:bg-danger/18 focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="submitRetirement"
        >
          Try again
        </button>

        <button
          v-else-if="retirement.state.value.status === 'success'"
          type="button"
          class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors"
          @click="requestClose"
        >
          Done
        </button>
      </footer>
    </section>
  </div>
</template>
