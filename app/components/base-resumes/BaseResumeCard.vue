<script setup lang="ts">
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

defineProps<{
  resume: BaseResumeManagementItemViewModel
}>()

const emit = defineEmits<{
  'retirement-requested': []
}>()
</script>

<template>
  <article
    class="bg-surface border-line flex h-full min-h-80 flex-col rounded-2xl border p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] sm:p-6"
  >
    <div class="flex items-start justify-between gap-4">
      <span
        class="border-line bg-panel text-accent grid size-11 shrink-0 place-items-center rounded-xl border"
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

      <span
        class="text-success inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-2.5 py-1.5 text-[0.6875rem] font-semibold"
      >
        <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
        {{ resume.statusLabel }}
      </span>
    </div>

    <div class="mt-6 min-w-0">
      <p
        class="text-accent text-[0.6875rem] font-bold tracking-[0.12em] uppercase"
      >
        {{ resume.slotLabel }}
      </p>
      <h3
        class="mt-2 text-base leading-6 font-semibold tracking-[-0.025em] break-words"
      >
        {{ resume.filename }}
      </h3>
      <p class="text-muted mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span>PDF</span>
        <span aria-hidden="true">·</span>
        <span>{{ resume.fileSizeLabel }}</span>
      </p>
      <p class="text-muted mt-2 text-xs">{{ resume.uploadedLabel }}</p>
    </div>

    <div
      class="border-line bg-panel/65 text-muted mt-auto grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 rounded-xl border p-3 text-[0.6875rem] leading-5"
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
          Original PDF preserved
        </strong>
        ResumAI never edits this source file.
      </span>
    </div>

    <button
      type="button"
      class="text-muted hover:text-danger focus-visible:outline-focus mt-2 min-h-11 self-start rounded-lg px-1 text-xs font-semibold transition-colors"
      :aria-label="`Retire ${resume.filename}`"
      @click="emit('retirement-requested')"
    >
      Retire resume
    </button>
  </article>
</template>
