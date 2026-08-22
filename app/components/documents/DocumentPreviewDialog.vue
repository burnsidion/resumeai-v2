<script setup lang="ts">
type DocumentPreviewPresentationState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | {
      actionLabel: string
      message: string
      status: 'failure'
    }

const props = defineProps<{
  contextLabel: string
  documentName: string
  open: boolean
  state: DocumentPreviewPresentationState
}>()

const emit = defineEmits<{
  close: []
  'error-action': []
  'focus-fallback-requested': []
}>()

const dialog = useTemplateRef<HTMLElement>('dialog')
const headingId = useId()
const descriptionId = useId()
let dialogActive = false
let previousBodyOverflow = ''
let previousFocus: HTMLElement | null = null

const getFocusableElements = (): HTMLElement[] =>
  Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'a[href], button, iframe, input, select, textarea, [tabindex]',
    ) ?? [],
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  )

const requestClose = (): void => {
  emit('close')
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

  const focusTarget = previousFocus
  previousFocus = null

  if (focusTarget?.isConnected) {
    nextTick(() => focusTarget.focus())
  } else {
    emit('focus-fallback-requested')
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
    class="bg-canvas/90 fixed inset-0 z-50 grid place-items-center overflow-hidden p-0 backdrop-blur-sm sm:p-5"
    @click.self="requestClose"
  >
    <section
      ref="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="headingId"
      :aria-describedby="descriptionId"
      :aria-busy="state.status === 'loading' || undefined"
      tabindex="-1"
      class="bg-panel border-line auth-elevation flex h-dvh w-full flex-col overflow-hidden border outline-none sm:h-[min(88dvh,56rem)] sm:max-w-6xl sm:rounded-2xl"
    >
      <header
        class="border-line flex min-h-20 shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-5"
      >
        <span
          class="border-accent/20 bg-accent/[0.07] text-accent grid size-10 shrink-0 place-items-center rounded-xl border"
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

        <div class="min-w-0 flex-1">
          <p
            :id="descriptionId"
            class="text-accent truncate text-[0.6875rem] font-semibold tracking-[0.13em] uppercase"
          >
            {{ contextLabel }}
          </p>
          <h2
            :id="headingId"
            class="mt-1 truncate text-base font-semibold tracking-[-0.02em] sm:text-lg"
            :title="documentName"
          >
            {{ documentName }}
          </h2>
        </div>

        <a
          v-if="state.status === 'ready'"
          :href="state.url"
          target="_blank"
          rel="noopener noreferrer"
          class="border-line bg-surface text-foreground hover:border-accent/45 hover:bg-raised inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors"
        >
          <span class="sm:hidden">Open</span>
          <span class="hidden sm:inline">Open in new tab</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4"
            aria-hidden="true"
          >
            <path d="M14 5h5v5M19 5l-8 8" />
            <path d="M19 13v6H5V5h6" />
          </svg>
        </a>

        <button
          type="button"
          class="border-line bg-surface text-muted hover:border-accent/45 hover:text-foreground grid size-11 shrink-0 place-items-center rounded-xl border transition-colors"
          aria-label="Close document preview"
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
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </header>

      <main class="bg-canvas/55 relative min-h-0 flex-1">
        <div
          v-if="state.status === 'loading'"
          class="grid h-full min-h-80 place-items-center px-6 py-10 text-center"
          role="status"
        >
          <div class="max-w-sm">
            <div class="relative mx-auto h-36 w-28" aria-hidden="true">
              <span
                class="border-line bg-surface absolute inset-x-3 inset-y-0 rotate-3 rounded-lg border"
              />
              <span
                class="border-line bg-raised absolute inset-x-1.5 inset-y-1.5 -rotate-2 rounded-lg border"
              />
              <span
                class="border-accent/35 bg-panel absolute inset-0 rounded-lg border shadow-2xl"
              >
                <span
                  class="bg-accent/55 absolute top-7 left-5 h-1.5 w-12 rounded-full"
                />
                <span
                  class="bg-line absolute top-12 left-5 h-1 w-16 rounded-full"
                />
                <span
                  class="bg-line absolute top-17 left-5 h-1 w-14 rounded-full"
                />
                <span
                  class="bg-line absolute top-25 left-5 h-1 w-16 rounded-full"
                />
              </span>
            </div>
            <p class="mt-6 text-base font-semibold">Preparing secure preview</p>
            <p class="text-muted mt-2 text-sm leading-6">
              Creating short-lived access to your private original PDF.
            </p>
          </div>
        </div>

        <iframe
          v-else-if="state.status === 'ready'"
          :src="state.url"
          :title="`Preview of ${documentName}`"
          referrerpolicy="no-referrer"
          class="bg-surface h-full min-h-80 w-full border-0"
        />

        <div
          v-else
          class="grid h-full min-h-80 place-items-center px-6 py-10 text-center"
        >
          <div class="max-w-md">
            <span
              class="border-danger/25 bg-danger/[0.07] text-danger mx-auto grid size-12 place-items-center rounded-xl border"
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
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.5" />
              </svg>
            </span>
            <div role="alert">
              <p class="mt-5 text-lg font-semibold">Preview unavailable</p>
              <p class="text-muted mt-2 text-sm leading-6">
                {{ state.message }}
              </p>
            </div>
            <button
              type="button"
              class="bg-accent text-canvas hover:bg-focus mt-6 min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors"
              @click="emit('error-action')"
            >
              {{ state.actionLabel }}
            </button>
          </div>
        </div>
      </main>
    </section>
  </div>
</template>
