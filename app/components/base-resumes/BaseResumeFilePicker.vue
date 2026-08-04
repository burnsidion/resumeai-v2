<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    accept?: string
    description?: string
    disabled?: boolean
    label?: string
  }>(),
  {
    accept: '.pdf,application/pdf',
    description: 'Choose a PDF or drag and drop it here.',
    disabled: false,
    label: 'Select a base resume',
  },
)

const emit = defineEmits<{
  'file-selected': [file: File]
}>()

const input = useTemplateRef<HTMLInputElement>('input')
const headingId = useId()
const descriptionId = useId()
const dragDepth = ref(0)
const isDragging = ref(false)

const resetDragState = () => {
  dragDepth.value = 0
  isDragging.value = false
}

const selectFirstFile = (files: FileList | null) => {
  const file = files?.[0]

  if (file) {
    emit('file-selected', file)
  }
}

const openFilePicker = () => {
  if (!props.disabled) {
    input.value?.click()
  }
}

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement

  selectFirstFile(target.files)

  // Permit choosing the same file again after the parent handles the event.
  target.value = ''
}

const isFileDrag = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files')

const handleDragEnter = (event: DragEvent) => {
  if (props.disabled || !isFileDrag(event)) {
    return
  }

  event.preventDefault()
  dragDepth.value += 1
  isDragging.value = true
}

const handleDragOver = (event: DragEvent) => {
  if (!props.disabled && isFileDrag(event)) {
    event.preventDefault()
  }
}

const handleDragLeave = () => {
  if (props.disabled || dragDepth.value === 0) {
    return
  }

  dragDepth.value = Math.max(0, dragDepth.value - 1)
  isDragging.value = dragDepth.value > 0
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  resetDragState()

  if (!props.disabled) {
    selectFirstFile(event.dataTransfer?.files ?? null)
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      resetDragState()
    }
  },
)
</script>

<template>
  <section
    :aria-labelledby="headingId"
    :aria-describedby="descriptionId"
    :aria-disabled="disabled || undefined"
    :data-drag-active="isDragging || undefined"
    class="bg-surface relative isolate overflow-hidden rounded-2xl border p-6 text-center transition-[border-color,background-color] sm:p-8"
    :class="
      isDragging
        ? 'border-accent bg-accent/[0.045]'
        : 'border-line hover:border-muted/60'
    "
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <span
      class="base-resume-picker-grid pointer-events-none absolute inset-0 -z-10 opacity-70"
      aria-hidden="true"
    />
    <span
      class="bg-panel pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 [mask-image:linear-gradient(to_top,black,transparent)]"
      aria-hidden="true"
    />

    <div
      class="border-line bg-raised shadow-canvas/40 mx-auto grid size-14 place-items-center rounded-2xl border shadow-xl"
      :class="isDragging ? 'text-accent border-accent/60' : 'text-muted'"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-6"
      >
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5M12 17v-6m-3 3 3-3 3 3" />
      </svg>
    </div>

    <p :id="headingId" class="mt-5 text-base font-semibold tracking-[-0.02em]">
      {{ isDragging ? 'Drop your PDF here' : label }}
    </p>
    <p :id="descriptionId" class="text-muted mx-auto mt-2 max-w-sm text-sm">
      {{ description }}
    </p>

    <button
      type="button"
      class="bg-accent text-canvas hover:bg-focus disabled:bg-high disabled:text-muted mt-5 min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
      :disabled="disabled"
      :aria-describedby="descriptionId"
      @click="openFilePicker"
    >
      Browse PDF
    </button>

    <input
      ref="input"
      class="hidden"
      type="file"
      :accept="accept"
      :disabled="disabled"
      tabindex="-1"
      aria-hidden="true"
      @change="handleInput"
    />

    <p class="sr-only" aria-live="polite">
      {{ isDragging ? 'Release to select this PDF.' : '' }}
    </p>
  </section>
</template>

<style scoped>
.base-resume-picker-grid {
  background-image:
    linear-gradient(rgb(89 216 229 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(89 216 229 / 5%) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(circle at center, black, transparent 72%);
}
</style>
