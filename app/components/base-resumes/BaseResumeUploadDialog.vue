<script setup lang="ts">
import BaseResumeFilePicker from '~/components/base-resumes/BaseResumeFilePicker.vue'
import type { BaseResumeUploadRecovery } from '~/composables/useBaseResumeUpload'
import { MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES } from '~~/shared/base-resumes/constraints'
import type { UploadedBaseResume } from '~~/shared/base-resumes/upload'

const props = defineProps<{
  activeCount: number
  activeLimit: 3
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  'recovery-requested': [recovery: 'refresh' | 'sign-in']
  uploaded: [baseResume: UploadedBaseResume]
}>()

const dialog = useTemplateRef<HTMLElement>('dialog')
const headingId = useId()
const descriptionId = useId()
const upload = useBaseResumeUpload()
let dialogActive = false
let previousBodyOverflow = ''
let previousFocus: HTMLElement | null = null

const remainingSlots = computed(() =>
  Math.max(0, props.activeLimit - props.activeCount),
)
const capacityReached = computed(() => remainingSlots.value === 0)
const capacityLabel = computed(() => {
  const slotLabel = `${remainingSlots.value} ${remainingSlots.value === 1 ? 'slot' : 'slots'} remaining`

  return `${props.activeCount} of ${props.activeLimit} active resumes · ${slotLabel}`
})
const canDismiss = computed(() => upload.state.value.status !== 'uploading')
const failure = computed(() =>
  upload.state.value.status === 'failure' ? upload.state.value.failure : null,
)
const blocksAnotherSelection = computed(
  () =>
    failure.value?.recovery === 'refresh' ||
    failure.value?.recovery === 'sign-in',
)
const showsPicker = computed(
  () =>
    !capacityReached.value &&
    upload.state.value.status !== 'success' &&
    !blocksAnotherSelection.value,
)
const selectedFile = computed(() => {
  const state = upload.state.value

  if (state.status === 'validating') {
    return state.file
  }

  if (state.status === 'ready' || state.status === 'uploading') {
    return state.selection.file
  }

  if (state.status === 'failure' && state.selection) {
    return state.selection.file
  }

  return null
})

const formatFileSize = (sizeBytes: number): string => {
  if (sizeBytes < 1024) {
    return `${sizeBytes} ${sizeBytes === 1 ? 'byte' : 'bytes'}`
  }

  const sizeMebibytes = sizeBytes / (1024 * 1024)

  if (sizeMebibytes >= 1) {
    return `${sizeMebibytes.toFixed(sizeMebibytes >= 10 ? 0 : 1)} MiB`
  }

  return `${Math.max(1, Math.ceil(sizeBytes / 1024))} KiB`
}

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
  upload.reset()

  const focusTarget = previousFocus
  previousFocus = null

  if (focusTarget?.isConnected) {
    nextTick(() => focusTarget.focus())
  }
}

const submitUpload = async (): Promise<void> => {
  const baseResume = await upload.uploadSelected()

  if (baseResume) {
    emit('uploaded', baseResume)
  }
}

const requestRecovery = (recovery: BaseResumeUploadRecovery): void => {
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
      :aria-busy="upload.isBusy.value || undefined"
      tabindex="-1"
      class="bg-panel border-line auth-elevation relative my-auto w-full max-w-2xl rounded-2xl border p-5 outline-none sm:p-7"
    >
      <button
        type="button"
        class="text-muted hover:bg-raised hover:text-foreground absolute top-4 right-4 grid size-11 place-items-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canDismiss"
        aria-label="Close upload dialog"
        @click="requestClose"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
          class="size-5"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      <header class="pr-12">
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Base resumes
        </p>
        <h2
          :id="headingId"
          class="mt-2 text-2xl font-semibold tracking-[-0.03em]"
        >
          Upload base resume
        </h2>
        <p
          :id="descriptionId"
          class="text-muted mt-3 max-w-xl text-sm leading-6"
        >
          Add an existing PDF as a source document. The original file is stored
          unchanged and is never edited by AI.
        </p>
      </header>

      <div
        class="border-line bg-surface/70 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-xs"
      >
        <span class="text-foreground font-medium">PDF only</span>
        <span class="text-muted" aria-hidden="true">·</span>
        <span class="text-muted">
          Maximum {{ MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES }} MiB
        </span>
        <span class="text-muted" aria-hidden="true">·</span>
        <span :class="capacityReached ? 'text-danger' : 'text-muted'">
          {{ capacityLabel }}
        </span>
      </div>

      <div
        v-if="
          capacityReached &&
          upload.state.value.status !== 'uploading' &&
          upload.state.value.status !== 'success' &&
          upload.state.value.status !== 'failure'
        "
        class="border-line bg-surface mt-6 rounded-2xl border p-5"
        role="status"
      >
        <h3 class="font-semibold">All three resume slots are in use</h3>
        <p class="text-muted mt-2 text-sm leading-6">
          A fourth active resume cannot be uploaded. No file has been selected
          or sent.
        </p>
      </div>

      <template v-else>
        <BaseResumeFilePicker
          v-if="showsPicker"
          class="mt-6"
          :disabled="upload.isBusy.value"
          :description="`Choose one PDF up to ${MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES} MiB, or drag and drop it here.`"
          :label="
            selectedFile ? 'Choose a different PDF' : 'Select a base resume'
          "
          @file-selected="upload.selectFile"
        />

        <div
          v-if="selectedFile"
          class="border-line bg-surface mt-4 grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border px-4 py-3"
        >
          <span
            class="border-line text-accent grid size-10 place-items-center rounded-lg border"
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
              {{ selectedFile.name.trim() }}
            </span>
            <span class="text-muted mt-0.5 block text-xs">
              {{ formatFileSize(selectedFile.size) }}
            </span>
          </span>
        </div>

        <div
          v-if="upload.state.value.status === 'validating'"
          class="text-muted mt-4 flex items-center gap-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <span
            class="auth-spinner border-muted border-t-accent size-4 rounded-full border-2"
            aria-hidden="true"
          />
          Checking the filename, size, and PDF signature…
        </div>

        <div
          v-else-if="upload.state.value.status === 'uploading'"
          class="border-accent/30 bg-accent/[0.045] mt-4 rounded-xl border px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <p class="flex items-center gap-3 text-sm font-medium">
            <span
              class="auth-spinner border-muted border-t-accent size-4 rounded-full border-2"
              aria-hidden="true"
            />
            Uploading and securing your resume…
          </p>
          <p class="text-muted mt-1 pl-7 text-xs">
            Keep this window open until the upload is confirmed.
          </p>
        </div>

        <div
          v-else-if="upload.state.value.status === 'success'"
          class="border-success/30 bg-success/[0.06] mt-6 rounded-2xl border p-5"
          role="status"
          aria-live="polite"
        >
          <p class="text-success text-sm font-semibold">Upload complete</p>
          <p class="mt-2 font-medium">
            {{ upload.state.value.baseResume.originalFilename }}
          </p>
          <p class="text-muted mt-1 text-sm">
            Saved as active resume slot
            {{ upload.state.value.baseResume.activeSlot }}.
          </p>
        </div>

        <div
          v-else-if="failure"
          class="border-danger/30 bg-danger/[0.055] mt-4 rounded-xl border px-4 py-3"
          role="alert"
        >
          <p class="text-sm font-semibold">Resume upload needs attention</p>
          <p class="text-muted mt-1 text-sm leading-6">
            {{ failure.message }}
          </p>
        </div>
      </template>

      <footer
        class="border-line mt-6 flex flex-wrap justify-end gap-3 border-t pt-5"
      >
        <button
          v-if="
            failure?.recovery === 'refresh' || failure?.recovery === 'sign-in'
          "
          type="button"
          class="border-line text-foreground hover:bg-raised min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
          @click="requestRecovery(failure.recovery)"
        >
          {{
            failure.recovery === 'sign-in'
              ? 'Return to sign in'
              : 'Refresh resumes'
          }}
        </button>

        <button
          v-if="upload.canSubmit.value && !capacityReached"
          type="button"
          class="bg-accent text-canvas hover:bg-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors"
          @click="submitUpload"
        >
          Upload resume
        </button>

        <button
          v-else-if="upload.canRetry.value && !capacityReached"
          type="button"
          class="bg-accent text-canvas hover:bg-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors"
          @click="submitUpload"
        >
          Try again
        </button>

        <button
          v-if="upload.state.value.status === 'success' || capacityReached"
          type="button"
          class="bg-accent text-canvas hover:bg-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors"
          @click="requestClose"
        >
          Done
        </button>
      </footer>
    </section>
  </div>
</template>
