<script setup lang="ts">
import type { ApplicationDeletionRecovery } from '~/composables/useApplicationDeletion'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'

const props = defineProps<{
  application: ApplicationDetailViewModel
  hasUnsavedChanges: boolean
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  deleted: [applicationId: string]
  'recovery-requested': [recovery: ApplicationDeletionRecovery]
}>()

const dialog = useTemplateRef<HTMLElement>('dialog')
const headingId = useId()
const descriptionId = useId()
const deletion = useApplicationDeletion()
let dialogActive = false
let previousBodyOverflow = ''
let previousFocus: HTMLElement | null = null

const canDismiss = computed(() => !deletion.isBusy.value)
const failure = computed(() =>
  deletion.state.value.status === 'failure'
    ? deletion.state.value.failure
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
  deletion.reset()

  const focusTarget = previousFocus
  previousFocus = null

  if (focusTarget?.isConnected) {
    nextTick(() => focusTarget.focus())
  }
}

const submitDeletion = async (): Promise<void> => {
  const deletedApplicationId = deletion.canRetry.value
    ? await deletion.retry()
    : await deletion.remove(props.application.id)

  if (deletedApplicationId) {
    emit('deleted', deletedApplicationId)
  }
}

const requestRecovery = (recovery: ApplicationDeletionRecovery): void => {
  if (
    recovery === 'back-to-applications' ||
    recovery === 'refresh-application' ||
    recovery === 'sign-in'
  ) {
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
      :aria-busy="deletion.isBusy.value || undefined"
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
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </svg>
      </span>

      <header class="mt-5">
        <p
          class="text-danger text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Permanent action
        </p>
        <h2
          :id="headingId"
          class="mt-2 text-2xl font-semibold tracking-[-0.035em]"
        >
          Delete this application?
        </h2>
        <p :id="descriptionId" class="text-muted mt-3 text-sm leading-7">
          <strong class="text-foreground font-semibold">
            {{ application.role }}
          </strong>
          at
          <strong class="text-foreground font-semibold">
            {{ application.company }}
          </strong>
          will be permanently removed.
        </p>
      </header>

      <div
        class="border-danger/20 bg-danger/[0.045] text-muted mt-5 grid grid-cols-[1rem_minmax(0,1fr)] gap-3 rounded-xl border p-4 text-xs leading-5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-danger mt-0.5 size-4"
          aria-hidden="true"
        >
          <path d="M12 9v4M12 17h.01" />
          <path
            d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"
          />
        </svg>
        <span>
          <strong class="text-foreground block font-semibold">
            This cannot be undone.
          </strong>
          Any working copy or finalized resume attached to this application is
          removed too. Your original base resume stays untouched.
        </span>
      </div>

      <p v-if="hasUnsavedChanges" class="text-muted mt-4 text-xs leading-5">
        Unsaved edits on this page will not be saved.
      </p>

      <div
        v-if="deletion.state.value.status === 'deleting'"
        class="border-danger/25 bg-danger/[0.045] mt-5 rounded-xl border px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p class="flex items-center gap-3 text-sm font-medium">
          <span
            class="auth-spinner border-muted border-t-danger size-4 rounded-full border-2 motion-reduce:animate-none"
            aria-hidden="true"
          />
          Deleting application…
        </p>
        <p class="text-muted mt-1 pl-7 text-xs">
          Keep this window open until the result is confirmed.
        </p>
      </div>

      <div
        v-else-if="failure"
        class="border-danger/30 bg-danger/[0.055] mt-5 rounded-xl border px-4 py-3"
        role="alert"
      >
        <p class="text-sm font-semibold">
          Application deletion needs attention
        </p>
        <p class="text-muted mt-1 text-sm leading-6">
          {{ failure.message }}
        </p>
      </div>

      <footer
        class="border-line mt-6 flex flex-wrap justify-end gap-3 border-t pt-5"
      >
        <button
          type="button"
          class="border-line text-foreground hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canDismiss"
          @click="requestClose"
        >
          Cancel
        </button>

        <button
          v-if="
            failure?.recovery === 'back-to-applications' ||
            failure?.recovery === 'refresh-application' ||
            failure?.recovery === 'sign-in'
          "
          type="button"
          class="border-line text-foreground hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
          @click="requestRecovery(failure.recovery)"
        >
          {{
            failure.recovery === 'sign-in'
              ? 'Return to sign in'
              : failure.recovery === 'back-to-applications'
                ? 'Back to applications'
                : 'Refresh application'
          }}
        </button>

        <button
          v-if="deletion.state.value.status === 'idle'"
          type="button"
          class="border-danger/30 bg-danger/12 text-danger hover:bg-danger/18 focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="submitDeletion"
        >
          Delete application
        </button>

        <button
          v-else-if="deletion.state.value.status === 'deleting'"
          type="button"
          class="border-danger/20 bg-danger/8 text-danger min-h-11 rounded-xl border px-5 text-sm font-semibold opacity-60"
          disabled
        >
          Deleting application…
        </button>

        <button
          v-else-if="deletion.canRetry.value"
          type="button"
          class="border-danger/30 bg-danger/12 text-danger hover:bg-danger/18 focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="submitDeletion"
        >
          Try again
        </button>
      </footer>
    </section>
  </div>
</template>
