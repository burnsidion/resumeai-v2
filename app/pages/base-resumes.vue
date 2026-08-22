<script setup lang="ts">
import BaseResumePreviewDialog from '~/components/base-resumes/BaseResumePreviewDialog.vue'
import BaseResumeRetirementDialog from '~/components/base-resumes/BaseResumeRetirementDialog.vue'
import BaseResumeUploadDialog from '~/components/base-resumes/BaseResumeUploadDialog.vue'
import type { RetiredBaseResume } from '~~/shared/base-resumes/retirement'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

interface BaseResumesPageContentInstance {
  focusHeading(): void
}

definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

useHead({
  title: 'Base resumes · ResumAI',
})

const { data: baseResumes, refresh, status } = useBaseResumes()
const pageContent =
  useTemplateRef<BaseResumesPageContentInstance>('pageContent')
const uploadDialogOpen = ref(false)
const selectedPreviewResume =
  shallowRef<BaseResumeManagementItemViewModel | null>(null)
const selectedRetirementResume =
  shallowRef<BaseResumeManagementItemViewModel | null>(null)

const openBaseResumeUpload = (): void => {
  if ((baseResumes.value?.remainingSlots ?? 0) > 0) {
    selectedPreviewResume.value = null
    selectedRetirementResume.value = null
    uploadDialogOpen.value = true
  }
}

const closeBaseResumeUpload = (): void => {
  uploadDialogOpen.value = false
}

const focusBaseResumesHeading = (): void => {
  pageContent.value?.focusHeading()
}

const openBaseResumePreview = (
  resume: BaseResumeManagementItemViewModel,
): void => {
  uploadDialogOpen.value = false
  selectedRetirementResume.value = null
  selectedPreviewResume.value = resume
}

const closeBaseResumePreview = (): void => {
  selectedPreviewResume.value = null
}

const openBaseResumeRetirement = (
  resume: BaseResumeManagementItemViewModel,
): void => {
  uploadDialogOpen.value = false
  selectedPreviewResume.value = null
  selectedRetirementResume.value = resume
}

const closeBaseResumeRetirement = (): void => {
  selectedRetirementResume.value = null
}

const closeRetirementAfterRefresh = async (
  retiredResumeId: string,
): Promise<void> => {
  const resumeStillActive = baseResumes.value?.items.some(
    (resume) => resume.id === retiredResumeId,
  )

  closeBaseResumeRetirement()

  if (!resumeStillActive) {
    await nextTick()
    pageContent.value?.focusHeading()
  }
}

const handleBaseResumeUploaded = async (): Promise<void> => {
  await refresh()
}

const refreshBaseResumesState = async (): Promise<boolean> => {
  try {
    await refresh()
  } catch {
    return false
  }

  return status.value !== 'error'
}

const handleBaseResumeRetired = async (
  retiredResume: RetiredBaseResume,
): Promise<void> => {
  if (selectedRetirementResume.value?.id !== retiredResume.id) {
    return
  }

  if (await refreshBaseResumesState()) {
    await closeRetirementAfterRefresh(retiredResume.id)
  }
}

const retryBaseResumes = async (): Promise<void> => {
  await refresh()
}

const handleUploadRecovery = async (
  recovery: 'refresh' | 'sign-in',
): Promise<void> => {
  if (recovery === 'sign-in') {
    closeBaseResumeUpload()
    await navigateTo('/sign-in')
    return
  }

  try {
    await refresh()
  } finally {
    closeBaseResumeUpload()
  }
}

const handleRetirementRecovery = async (
  recovery: 'refresh' | 'sign-in',
): Promise<void> => {
  if (recovery === 'sign-in') {
    closeBaseResumeRetirement()
    await navigateTo('/sign-in')
    return
  }

  const selectedResumeId = selectedRetirementResume.value?.id

  if (await refreshBaseResumesState()) {
    if (selectedResumeId) {
      await closeRetirementAfterRefresh(selectedResumeId)
    } else {
      closeBaseResumeRetirement()
    }
  }
}

const handlePreviewRecovery = async (
  recovery: 'refresh' | 'sign-in',
): Promise<void> => {
  if (recovery === 'sign-in') {
    closeBaseResumePreview()
    await navigateTo('/sign-in')
    return
  }

  if (await refreshBaseResumesState()) {
    closeBaseResumePreview()
  }
}
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <template v-if="baseResumes">
      <BaseResumesPageContent
        ref="pageContent"
        :resumes="baseResumes"
        @preview-requested="openBaseResumePreview"
        @retirement-requested="openBaseResumeRetirement"
        @upload-requested="openBaseResumeUpload"
      />

      <BaseResumeUploadDialog
        :active-count="baseResumes.activeCount"
        :active-limit="baseResumes.activeLimit"
        :open="uploadDialogOpen"
        @close="closeBaseResumeUpload"
        @focus-fallback-requested="focusBaseResumesHeading"
        @recovery-requested="handleUploadRecovery"
        @uploaded="handleBaseResumeUploaded"
      />

      <BaseResumePreviewDialog
        v-if="selectedPreviewResume"
        :open="true"
        :resume="selectedPreviewResume"
        @close="closeBaseResumePreview"
        @focus-fallback-requested="focusBaseResumesHeading"
        @recovery-requested="handlePreviewRecovery"
      />

      <BaseResumeRetirementDialog
        v-if="selectedRetirementResume"
        :open="true"
        :resume="selectedRetirementResume"
        @close="closeBaseResumeRetirement"
        @recovery-requested="handleRetirementRecovery"
        @retired="handleBaseResumeRetired"
      />
    </template>

    <section
      v-else-if="status === 'error'"
      class="border-line bg-surface mx-auto flex min-h-96 max-w-3xl flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center"
      role="alert"
      aria-labelledby="base-resumes-error-heading"
    >
      <span
        class="border-danger/30 bg-danger/7 text-danger grid size-16 place-items-center rounded-2xl border"
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
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <p
        class="text-danger mt-6 text-xs font-semibold tracking-[0.14em] uppercase"
      >
        Something interrupted the request
      </p>
      <h1
        id="base-resumes-error-heading"
        class="mt-3 text-2xl font-semibold tracking-[-0.035em]"
      >
        Base resumes unavailable
      </h1>
      <p class="text-muted mt-3 max-w-xl text-sm leading-7">
        We could not load your active base resumes. Nothing has been changed.
        Try the request again.
      </p>
      <button
        type="button"
        class="border-line bg-raised text-foreground hover:bg-high focus-visible:outline-focus mt-6 min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
        @click="retryBaseResumes"
      >
        Try again
      </button>
    </section>

    <section
      v-else
      aria-busy="true"
      aria-labelledby="base-resumes-loading-heading"
    >
      <h1 id="base-resumes-loading-heading" class="sr-only">
        Loading base resumes
      </h1>
      <div class="animate-pulse" aria-hidden="true">
        <div class="bg-raised h-3 w-28 rounded" />
        <div class="bg-raised mt-5 h-12 w-64 max-w-full rounded-xl" />
        <div class="bg-raised mt-5 h-4 max-w-2xl rounded" />
        <div class="border-line bg-surface mt-10 h-28 rounded-2xl border" />
        <div class="mt-9 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <div
            v-for="slot in 3"
            :key="slot"
            class="border-line bg-surface min-h-80 rounded-2xl border"
          />
        </div>
      </div>
      <p class="sr-only" role="status">Loading base resumes.</p>
    </section>
  </main>
</template>
