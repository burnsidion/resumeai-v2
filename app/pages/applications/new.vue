<script setup lang="ts">
import ApplicationCreationForm from '~/components/applications/ApplicationCreationForm.vue'
import type { ApplicationCreationRecovery } from '~/composables/useApplicationCreation'
import type { CreateApplicationRequest } from '~~/shared/applications/management'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'

definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

useHead({
  title: 'Create application · ResumAI',
})

const {
  data: baseResumes,
  refresh: refreshBaseResumes,
  status: baseResumesRequestStatus,
} = useBaseResumes()
const creation = useApplicationCreation()

const baseResumeItems = computed(() => baseResumes.value?.items ?? [])
const baseResumesStatus = computed<'error' | 'pending' | 'success'>(() => {
  if (baseResumesRequestStatus.value === 'error') {
    return 'error'
  }

  return baseResumesRequestStatus.value === 'success' ? 'success' : 'pending'
})

const navigateToCreatedApplication = async (
  application: ApplicationDetailViewModel | null,
): Promise<ApplicationDetailViewModel | null> => {
  if (application) {
    await navigateTo(`/applications/${application.id}`)
  }

  return application
}

const createApplication = (
  input: CreateApplicationRequest,
): Promise<ApplicationDetailViewModel | null> =>
  creation.create(input).then(navigateToCreatedApplication)

const cancelCreation = async (): Promise<void> => {
  await navigateTo('/applications')
}

const handleCreationRecovery = async (
  recovery: ApplicationCreationRecovery,
): Promise<void> => {
  switch (recovery) {
    case 'check-dashboard':
      await navigateTo('/dashboard')
      return
    case 'refresh-base-resumes':
      await refreshBaseResumes()
      creation.reset()
      return
    case 'retry':
      await navigateToCreatedApplication(await creation.retry())
      return
    case 'review-details':
      creation.reset()
      return
    case 'sign-in':
      await navigateTo('/sign-in', { replace: true })
  }
}
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <button
      type="button"
      class="text-muted hover:bg-surface hover:text-foreground focus-visible:outline-focus inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-45"
      :disabled="creation.isBusy.value"
      @click="cancelCreation"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-4"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      Applications
    </button>

    <header
      class="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          New application
        </p>
        <h1
          class="mt-2 text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-[2.5rem]"
        >
          Create application
        </h1>
        <p class="text-muted mt-2 max-w-2xl text-sm leading-6 sm:text-base">
          Save the opportunity now. You can prepare it for tailoring whenever
          you are ready.
        </p>
      </div>
      <span
        class="border-line bg-raised text-muted inline-flex min-h-8 w-fit shrink-0 items-center rounded-lg border px-3 text-xs font-semibold"
      >
        Creates as Draft
      </span>
    </header>

    <ApplicationCreationForm
      :base-resumes="baseResumeItems"
      :base-resumes-status="baseResumesStatus"
      :creation-state="creation.state.value"
      :submit="createApplication"
      @cancel="cancelCreation"
      @details-changed="creation.reset"
      @recovery-requested="handleCreationRecovery"
      @resume-retry-requested="refreshBaseResumes"
    />
  </main>
</template>
