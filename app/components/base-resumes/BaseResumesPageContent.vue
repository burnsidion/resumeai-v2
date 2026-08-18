<script setup lang="ts">
import BaseResumeCard from '~/components/base-resumes/BaseResumeCard.vue'
import { MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES } from '~~/shared/base-resumes/constraints'
import type { BaseResumesManagementViewModel } from '~~/shared/base-resumes/view-model'

defineProps<{
  resumes: BaseResumesManagementViewModel
}>()

const emit = defineEmits<{
  'upload-requested': []
}>()
</script>

<template>
  <section aria-labelledby="base-resumes-page-heading">
    <header
      class="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="max-w-3xl">
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Source documents
        </p>
        <h1
          id="base-resumes-page-heading"
          class="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl"
        >
          Base resumes
        </h1>
        <p class="text-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
          Keep up to three existing PDF resumes ready for new applications and
          tailoring. Uploaded originals stay private and unchanged.
        </p>
      </div>

      <button
        v-if="resumes.remainingSlots > 0"
        type="button"
        class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors"
        @click="emit('upload-requested')"
      >
        Upload base resume
      </button>
    </header>

    <section
      class="border-line bg-surface mt-10 flex min-h-28 flex-col justify-between gap-5 rounded-2xl border p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] sm:flex-row sm:items-center sm:p-6"
      aria-labelledby="base-resume-capacity-heading"
    >
      <div>
        <p
          class="text-accent text-[0.6875rem] font-semibold tracking-[0.12em] uppercase"
        >
          Active capacity
        </p>
        <h2
          id="base-resume-capacity-heading"
          class="mt-2 text-lg font-semibold tracking-[-0.025em]"
        >
          {{ resumes.capacityLabel }}
        </h2>
        <p class="text-muted mt-1 text-xs">
          {{ resumes.capacityStatusLabel }}
        </p>
      </div>

      <div
        class="grid w-full grid-cols-3 gap-2 sm:max-w-md"
        :aria-label="resumes.capacityAriaLabel"
      >
        <span
          v-for="slot in resumes.activeLimit"
          :key="slot"
          class="border-line bg-raised h-2 rounded-full border"
          :class="{
            'border-accent/60 bg-accent shadow-[0_0_16px_rgb(89_216_229/0.14)]':
              slot <= resumes.activeCount,
          }"
        />
      </div>
    </section>

    <section
      v-if="resumes.activeCount === 0"
      class="border-line bg-surface/70 mt-6 flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-12 text-center"
      aria-labelledby="base-resumes-empty-heading"
    >
      <span
        class="border-accent/35 bg-accent/7 text-accent grid size-16 place-items-center rounded-2xl border shadow-xl shadow-black/25"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-7"
        >
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      </span>
      <p
        class="text-accent mt-6 text-xs font-semibold tracking-[0.14em] uppercase"
      >
        Start with a source you trust
      </p>
      <h2
        id="base-resumes-empty-heading"
        class="mt-3 text-2xl font-semibold tracking-[-0.035em]"
      >
        Add your first base resume
      </h2>
      <p class="text-muted mt-3 max-w-xl text-sm leading-7">
        Upload an existing PDF to use as the starting point for future
        applications. ResumAI stores the original without editing it.
      </p>
      <button
        type="button"
        class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus mt-6 min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors"
        @click="emit('upload-requested')"
      >
        Choose a PDF
      </button>
      <p class="text-muted mt-4 text-xs">
        PDF only · Maximum {{ MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES }} MiB
      </p>
    </section>

    <section v-else class="mt-9" aria-labelledby="active-base-resumes-heading">
      <div class="flex items-end justify-between gap-5">
        <div>
          <h2
            id="active-base-resumes-heading"
            class="text-lg font-semibold tracking-[-0.025em]"
          >
            Active base resumes
          </h2>
          <p class="text-muted mt-1 text-xs sm:text-sm">
            Available for new applications and tailoring.
          </p>
        </div>
        <span class="text-muted shrink-0 text-xs">
          {{ resumes.activeCountLabel }}
        </span>
      </div>

      <ul class="mt-4 grid list-none gap-5 p-0 lg:grid-cols-2 2xl:grid-cols-3">
        <li v-for="resume in resumes.items" :key="resume.id" class="min-w-0">
          <BaseResumeCard :resume="resume" />
        </li>

        <li v-if="resumes.remainingSlots > 0" class="min-w-0">
          <button
            type="button"
            class="border-line bg-surface/35 text-muted hover:border-accent/60 hover:bg-accent/4 focus-visible:outline-focus flex min-h-80 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center transition-colors"
            @click="emit('upload-requested')"
          >
            <span
              class="border-accent/35 bg-accent/7 text-accent grid size-11 place-items-center rounded-xl border"
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
                <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
                <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </svg>
            </span>
            <span>
              <strong class="text-foreground block text-sm font-semibold">
                Upload another base resume
              </strong>
              <span class="mt-1 block text-xs">
                {{ resumes.capacityStatusLabel }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>
