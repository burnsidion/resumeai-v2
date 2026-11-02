<script setup lang="ts">
import ApplicationDeletionDialog from '~/components/applications/ApplicationDeletionDialog.vue'
import ApplicationEditingForm from '~/components/applications/ApplicationEditingForm.vue'
import ApplicationTailoringPanel from '~/components/applications/ApplicationTailoringPanel.vue'
import ApplicationWorkingCopyReview from '~/components/applications/ApplicationWorkingCopyReview.vue'
import ApplicationWorkingCopySourcePreviewDialog from '~/components/applications/ApplicationWorkingCopySourcePreviewDialog.vue'
import type { ApplicationDeletionRecovery } from '~/composables/useApplicationDeletion'
import type { ApplicationEditingRecovery } from '~/composables/useApplicationEditing'
import type { ApplicationTailoringRecovery } from '~/composables/useApplicationTailoring'
import type { ApplicationWorkingCopyActionRecovery } from '~/composables/useApplicationWorkingCopyActions'
import type { ApplicationWorkingCopyReviewRecovery } from '~/composables/useApplicationWorkingCopyReview'
import type { ApplicationWorkingCopySourcePreviewRecovery } from '~/composables/useApplicationWorkingCopySourcePreview'
import type { UpdateApplicationRequest } from '~~/shared/applications/management'
import {
  applicationDetailResponseSchema,
  type ApplicationDetailResponse,
  type ApplicationDetailViewModel,
} from '~~/shared/applications/view-model'

definePageMeta({
  layout: 'authenticated',
  middleware: 'authenticated',
})

const route = useRoute()
const applicationId = Array.isArray(route.params.id)
  ? (route.params.id[0] ?? '')
  : (route.params.id ?? '')
const {
  data,
  error: applicationError,
  refresh: refreshApplicationRequest,
  status: applicationStatus,
} = useFetch<ApplicationDetailResponse>(
  `/api/applications/${encodeURIComponent(applicationId)}`,
  {
    key: `application-detail-${applicationId}`,
    transform: (response) => applicationDetailResponseSchema.parse(response),
  },
)
const {
  data: baseResumes,
  refresh: refreshBaseResumesRequest,
  status: baseResumesRequestStatus,
} = useBaseResumes()
const editing = useApplicationEditing()
const tailoring = useApplicationTailoring()
const workingCopyActions = useApplicationWorkingCopyActions()
const workingCopyReview = useApplicationWorkingCopyReview()

const isDirty = ref(false)
const navigationApproved = ref(false)
const savedAnnouncement = ref('')
const deletionDialogOpen = ref(false)
const sourcePreviewOpen = ref(false)

const application = computed(() => data.value?.application ?? null)
const baseResumeItems = computed(() => baseResumes.value?.items ?? [])
const baseResumesStatus = computed<'error' | 'pending' | 'success'>(() => {
  if (baseResumesRequestStatus.value === 'error') {
    return 'error'
  }

  return baseResumesRequestStatus.value === 'success' ? 'success' : 'pending'
})
const editorKey = computed(() =>
  application.value
    ? `${application.value.id}:${application.value.updatedAt}`
    : 'application-editor',
)
const applicationErrorStatus = computed(() => {
  const error = applicationError.value

  if (typeof error !== 'object' || error === null) {
    return null
  }

  const candidate = error as { status?: unknown; statusCode?: unknown }
  const statusCode = candidate.statusCode ?? candidate.status

  return typeof statusCode === 'number' && Number.isInteger(statusCode)
    ? statusCode
    : null
})
const applicationUnavailable = computed(
  () =>
    applicationErrorStatus.value === 400 ||
    applicationErrorStatus.value === 404,
)
const applicationHasWorkingCopy = computed(() => {
  const state = application.value?.tailoring.state

  return state === 'working-copy-ready' || state === 'working-copy-accepted'
})
const currentWorkingCopyReview = computed(() =>
  workingCopyReview.state.value.status === 'ready'
    ? workingCopyReview.state.value.review
    : null,
)
const authenticationRequired = computed(
  () => applicationErrorStatus.value === 401,
)
const statusClasses = {
  attention: 'border-accent/25 bg-accent/10 text-accent',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-line bg-high text-foreground',
  neutral: 'border-line bg-panel text-muted',
  success: 'border-success/25 bg-success/10 text-success',
} as const

useHead(() => ({
  title: application.value
    ? `${application.value.role} at ${application.value.company} · ResumAI`
    : 'Application · ResumAI',
}))

const confirmDiscard = (): boolean =>
  !isDirty.value ||
  window.confirm(
    'Discard your unsaved changes? Your last confirmed save will be preserved.',
  )

const navigateAway = async (
  destination: string,
  options?: { replace?: boolean },
): Promise<void> => {
  if (!confirmDiscard()) {
    return
  }

  navigationApproved.value = true

  try {
    if (options) {
      await navigateTo(destination, options)
    } else {
      await navigateTo(destination)
    }
  } finally {
    navigationApproved.value = false
  }
}

const applyConfirmedApplication = async (
  updatedApplication: ApplicationDetailViewModel | null,
): Promise<ApplicationDetailViewModel | null> => {
  if (!updatedApplication) {
    return null
  }

  data.value = { application: updatedApplication }
  savedAnnouncement.value = `Changes to ${updatedApplication.role} were saved.`
  isDirty.value = false
  await nextTick()
  editing.reset()

  return updatedApplication
}

const saveApplication = (
  input: UpdateApplicationRequest,
): Promise<ApplicationDetailViewModel | null> =>
  editing.save(applicationId, input).then(applyConfirmedApplication)

const retryApplicationSave = (): Promise<ApplicationDetailViewModel | null> =>
  editing.retry().then(applyConfirmedApplication)

const reloadApplication = async (): Promise<void> => {
  data.value = undefined
  savedAnnouncement.value = ''
  isDirty.value = false
  editing.reset()
  await refreshApplicationRequest()
}

const refreshBaseResumes = async (): Promise<void> => {
  await refreshBaseResumesRequest()
  editing.reset()
}

const openDeletionDialog = (): void => {
  if (!editing.isBusy.value && !tailoring.isBusy.value) {
    deletionDialogOpen.value = true
  }
}

const closeDeletionDialog = (): void => {
  deletionDialogOpen.value = false
}

const handleApplicationDeleted = async (
  deletedApplicationId: string,
): Promise<void> => {
  if (deletedApplicationId !== applicationId) {
    return
  }

  deletionDialogOpen.value = false
  data.value = undefined
  isDirty.value = false
  savedAnnouncement.value = ''
  editing.reset()
  clearNuxtData('applications-list')
  clearNuxtData('dashboard')
  navigationApproved.value = true

  try {
    await navigateTo('/applications', { replace: true })
  } finally {
    navigationApproved.value = false
  }
}

const handleDeletionRecovery = async (
  recovery: ApplicationDeletionRecovery,
): Promise<void> => {
  switch (recovery) {
    case 'back-to-applications':
      closeDeletionDialog()
      await navigateAway('/applications')
      return
    case 'refresh-application':
      closeDeletionDialog()
      await reloadApplication()
      return
    case 'retry':
      return
    case 'sign-in':
      closeDeletionDialog()
      await navigateAway('/sign-in', { replace: true })
  }
}

const handleEditingRecovery = async (
  recovery: ApplicationEditingRecovery,
): Promise<void> => {
  switch (recovery) {
    case 'back-to-applications':
      await navigateAway('/applications')
      return
    case 'refresh-application':
      await reloadApplication()
      return
    case 'refresh-base-resumes':
      await refreshBaseResumes()
      return
    case 'retry':
      await retryApplicationSave()
      return
    case 'review-details':
      editing.reset()
      return
    case 'sign-in':
      await navigateAway('/sign-in', { replace: true })
  }
}

const focusTailoringDetails = async (): Promise<void> => {
  const currentApplication = application.value

  if (!currentApplication) {
    return
  }

  editing.reset()
  await nextTick()

  const missingJobDescription =
    currentApplication.readiness.missingRequirements.some(
      (requirement) => requirement.id === 'job-description',
    )

  if (missingJobDescription) {
    document.getElementById('application-job-description')?.focus()
    return
  }

  document
    .querySelector<HTMLInputElement>(
      'input[name="application-base-resume"]:not([disabled])',
    )
    ?.focus()
}

const refreshTailoringStatus = async (): Promise<void> => {
  await refreshApplicationRequest()

  if (
    application.value?.tailoring.state === 'working-copy-ready' ||
    application.value?.tailoring.state === 'working-copy-accepted'
  ) {
    tailoring.reset()
    clearNuxtData('applications-list')
    clearNuxtData('dashboard')
  }

  await refreshWorkingCopyReview()
}

const refreshWorkingCopyReview = async (): Promise<void> => {
  if (!applicationHasWorkingCopy.value) {
    sourcePreviewOpen.value = false
    workingCopyReview.reset()
    return
  }

  await workingCopyReview.load(applicationId)
}

const startTailoring = async (): Promise<void> => {
  const response = await tailoring.start(applicationId)

  if (!response) {
    return
  }

  savedAnnouncement.value = 'Your working copy was created.'
  await refreshTailoringStatus()
}

const handleConfirmedWorkingCopyAction = async (
  message: string,
): Promise<void> => {
  savedAnnouncement.value = message
  await refreshTailoringStatus()
}

const acceptWorkingCopy = async (): Promise<void> => {
  const review = currentWorkingCopyReview.value

  if (!review) {
    return
  }

  const accepted = await workingCopyActions.accept(
    applicationId,
    review.workingCopy.id,
    review.workingCopy.revisionNumber,
  )

  if (accepted) {
    await handleConfirmedWorkingCopyAction(
      'Your working copy was accepted. Your original PDF remains unchanged.',
    )
  }
}

const discardWorkingCopy = async (): Promise<void> => {
  const review = currentWorkingCopyReview.value

  if (!review) {
    return
  }

  const discarded = await workingCopyActions.discard(
    applicationId,
    review.workingCopy.id,
    review.workingCopy.revisionNumber,
  )

  if (discarded) {
    await handleConfirmedWorkingCopyAction(
      'The working copy was discarded. Your original PDF remains unchanged.',
    )
  }
}

const reviseWorkingCopy = async (guidance: string): Promise<void> => {
  const review = currentWorkingCopyReview.value

  if (!review) {
    return
  }

  const revised = await workingCopyActions.revise(
    applicationId,
    review.workingCopy.id,
    review.workingCopy.revisionNumber,
    { guidance },
  )

  if (revised) {
    await handleConfirmedWorkingCopyAction(
      'A revised working copy is ready for review.',
    )
  }
}

const handleTailoringRecovery = async (
  recovery: ApplicationTailoringRecovery,
): Promise<void> => {
  switch (recovery) {
    case 'back-to-applications':
      await navigateAway('/applications')
      return
    case 'refresh-application':
      await refreshTailoringStatus()
      return
    case 'retry':
      await tailoring.retry()
      await refreshTailoringStatus()
      return
    case 'review-details':
      await focusTailoringDetails()
      return
    case 'sign-in':
      await navigateAway('/sign-in', { replace: true })
  }
}

const handleWorkingCopyReviewRecovery = async (
  recovery: ApplicationWorkingCopyReviewRecovery,
): Promise<void> => {
  switch (recovery) {
    case 'back-to-applications':
      await navigateAway('/applications')
      return
    case 'refresh-application':
      await reloadApplication()
      await refreshWorkingCopyReview()
      return
    case 'retry':
      await workingCopyReview.retry()
      return
    case 'sign-in':
      await navigateAway('/sign-in', { replace: true })
  }
}

const handleWorkingCopyActionRecovery = async (
  recovery: ApplicationWorkingCopyActionRecovery,
): Promise<void> => {
  switch (recovery) {
    case 'back-to-applications':
      await navigateAway('/applications')
      return
    case 'refresh-application':
      await reloadApplication()
      await refreshWorkingCopyReview()
      return
    case 'sign-in':
      await navigateAway('/sign-in', { replace: true })
      return
    case 'retry':
      await retryWorkingCopyAction()
  }
}

const retryWorkingCopyAction = async (): Promise<void> => {
  const completed = await workingCopyActions.retry()

  if (completed) {
    await handleConfirmedWorkingCopyAction('Your working copy was updated.')
  }
}

const handleSourcePreviewRecovery = async (
  recovery: Exclude<ApplicationWorkingCopySourcePreviewRecovery, 'retry'>,
): Promise<void> => {
  sourcePreviewOpen.value = false

  if (recovery === 'sign-in') {
    await navigateAway('/sign-in', { replace: true })
    return
  }

  if (recovery === 'back-to-applications') {
    await navigateAway('/applications')
    return
  }

  await reloadApplication()
  await refreshWorkingCopyReview()
}

const focusWorkingCopyReview = (): void => {
  document.getElementById('working-copy-review-heading')?.focus()
}

const handleDirtyChanged = (dirty: boolean): void => {
  isDirty.value = dirty

  if (dirty) {
    savedAnnouncement.value = ''
  }
}

const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
  if (!isDirty.value || navigationApproved.value) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (navigationApproved.value || !isDirty.value) {
    return true
  }

  return confirmDiscard()
})

onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onMounted(() => {
  void refreshWorkingCopyReview()
})
onBeforeUnmount(() =>
  window.removeEventListener('beforeunload', handleBeforeUnload),
)

watch(applicationHasWorkingCopy, (hasWorkingCopy, previouslyHadWorkingCopy) => {
  if (!import.meta.client || hasWorkingCopy === previouslyHadWorkingCopy) {
    return
  }

  void refreshWorkingCopyReview()
})
</script>

<template>
  <main class="min-h-dvh px-5 py-8 sm:px-8 xl:px-12 xl:py-10">
    <template v-if="application">
      <button
        type="button"
        class="text-muted hover:bg-surface hover:text-foreground focus-visible:outline-focus inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-45"
        :disabled="editing.isBusy.value"
        @click="navigateAway('/applications')"
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
        class="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div class="min-w-0">
          <p
            class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
          >
            Application workspace
          </p>
          <h1
            class="mt-2 text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-[2.5rem]"
          >
            {{ application.role }}
          </h1>
          <p class="text-muted mt-2 text-sm leading-6 sm:text-base">
            {{ application.company }}
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-3">
          <span
            class="inline-flex min-h-8 items-center rounded-lg border px-3 text-xs font-semibold"
            :class="statusClasses[application.statusTone]"
          >
            {{ application.statusLabel }}
          </span>
          <span class="text-muted text-xs">
            Updated {{ application.updatedLabel }}
          </span>
        </div>
      </header>

      <p
        class="text-success mt-5 min-h-5 text-sm font-medium"
        role="status"
        aria-live="polite"
      >
        {{ savedAnnouncement }}
      </p>

      <ApplicationEditingForm
        :key="editorKey"
        :application="application"
        :base-resumes="baseResumeItems"
        :base-resumes-status="baseResumesStatus"
        :editing-state="editing.state.value"
        :submit="saveApplication"
        @cancel="navigateAway('/applications')"
        @details-changed="editing.reset"
        @dirty-changed="handleDirtyChanged"
        @recovery-requested="handleEditingRecovery"
        @resume-retry-requested="refreshBaseResumesRequest"
      />

      <ApplicationWorkingCopyReview
        v-if="currentWorkingCopyReview"
        :action-state="workingCopyActions.state.value"
        :review="currentWorkingCopyReview"
        @accept-requested="acceptWorkingCopy"
        @action-recovery-requested="handleWorkingCopyActionRecovery"
        @action-retry-requested="retryWorkingCopyAction"
        @discard-requested="discardWorkingCopy"
        @revision-requested="reviseWorkingCopy"
        @source-preview-requested="sourcePreviewOpen = true"
      />

      <section
        v-else-if="
          applicationHasWorkingCopy && workingCopyReview.isLoading.value
        "
        class="border-line bg-surface mt-8 rounded-2xl border p-5 sm:p-6"
        aria-busy="true"
        aria-live="polite"
        aria-labelledby="working-copy-review-heading"
      >
        <p
          class="text-accent text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Working copy ready
        </p>
        <h2
          id="working-copy-review-heading"
          tabindex="-1"
          class="mt-2 text-lg font-semibold tracking-[-0.02em] outline-none"
        >
          Loading your review workspace
        </h2>
        <p class="text-muted mt-2 text-sm leading-6">
          Preparing your source, working copy, and material changes for review.
        </p>
      </section>

      <section
        v-else-if="
          applicationHasWorkingCopy &&
          workingCopyReview.state.value.status === 'failure'
        "
        class="border-danger/25 bg-danger/[0.035] mt-8 rounded-2xl border p-5 sm:p-6"
        role="alert"
        aria-labelledby="working-copy-review-heading"
      >
        <p
          class="text-danger text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Review needs attention
        </p>
        <h2
          id="working-copy-review-heading"
          tabindex="-1"
          class="mt-2 text-lg font-semibold tracking-[-0.02em] outline-none"
        >
          We couldn’t load this working copy
        </h2>
        <p class="text-muted mt-2 max-w-2xl text-sm leading-6">
          {{ workingCopyReview.state.value.failure.message }}
        </p>
        <button
          type="button"
          class="border-line bg-panel hover:bg-raised focus-visible:outline-focus mt-5 min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="
            handleWorkingCopyReviewRecovery(
              workingCopyReview.state.value.failure.recovery,
            )
          "
        >
          {{
            workingCopyReview.state.value.failure.recovery ===
            'back-to-applications'
              ? 'Back to applications'
              : workingCopyReview.state.value.failure.recovery ===
                  'refresh-application'
                ? 'Refresh application'
                : workingCopyReview.state.value.failure.recovery === 'sign-in'
                  ? 'Return to sign in'
                  : 'Try again'
          }}
        </button>
      </section>

      <ApplicationTailoringPanel
        v-else
        :application="application"
        :request-state="tailoring.state.value"
        @recovery-requested="handleTailoringRecovery"
        @start-requested="startTailoring"
      />

      <section
        class="border-danger/25 bg-danger/[0.035] mt-8 rounded-2xl border p-5 sm:p-6"
        aria-labelledby="application-deletion-heading"
      >
        <p
          class="text-danger text-xs font-semibold tracking-[0.14em] uppercase"
        >
          Danger zone
        </p>
        <div
          class="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2
              id="application-deletion-heading"
              class="text-lg font-semibold tracking-[-0.02em]"
            >
              Delete application
            </h2>
            <p class="text-muted mt-1 max-w-2xl text-sm leading-6">
              Permanently remove this application and any attached working copy
              or finalized resume. Your original base resume stays untouched.
            </p>
          </div>
          <button
            type="button"
            class="border-danger/30 bg-danger/12 text-danger hover:bg-danger/18 focus-visible:outline-focus min-h-11 shrink-0 rounded-xl border px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="
              editing.isBusy.value ||
              tailoring.isBusy.value ||
              workingCopyActions.isBusy.value
            "
            @click="openDeletionDialog"
          >
            Delete application
          </button>
        </div>
      </section>

      <ApplicationDeletionDialog
        :open="deletionDialogOpen"
        :application="application"
        :has-unsaved-changes="isDirty"
        @close="closeDeletionDialog"
        @deleted="handleApplicationDeleted"
        @recovery-requested="handleDeletionRecovery"
      />

      <ApplicationWorkingCopySourcePreviewDialog
        v-if="sourcePreviewOpen && currentWorkingCopyReview"
        :application-id="applicationId"
        :filename="currentWorkingCopyReview.source.filename"
        :open="true"
        @close="sourcePreviewOpen = false"
        @focus-fallback-requested="focusWorkingCopyReview"
        @recovery-requested="handleSourcePreviewRecovery"
      />
    </template>

    <section
      v-else-if="applicationStatus === 'error'"
      class="bg-surface border-line mx-auto mt-[8vh] max-w-2xl rounded-2xl border p-6 sm:p-8"
      role="alert"
      aria-labelledby="application-error-heading"
    >
      <p class="text-danger text-xs font-semibold tracking-[0.14em] uppercase">
        {{
          authenticationRequired
            ? 'Session required'
            : 'Application unavailable'
        }}
      </p>
      <h1
        id="application-error-heading"
        class="mt-2 text-2xl font-semibold tracking-[-0.03em]"
      >
        {{
          authenticationRequired
            ? 'Sign in to continue'
            : applicationUnavailable
              ? 'This application can’t be opened'
              : 'We couldn’t load this application'
        }}
      </h1>
      <p class="text-muted mt-3 text-sm leading-6">
        <template v-if="authenticationRequired">
          Your session is no longer available. Sign in again to return to your
          application workspace.
        </template>
        <template v-else-if="applicationUnavailable">
          It may no longer exist, or it may not be available to your account.
        </template>
        <template v-else>
          Your information has not been changed. Try loading the application
          again.
        </template>
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button
          v-if="!applicationUnavailable && !authenticationRequired"
          type="button"
          class="bg-accent text-canvas focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold"
          @click="reloadApplication"
        >
          Try again
        </button>
        <button
          v-if="authenticationRequired"
          type="button"
          class="bg-accent text-canvas focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold"
          @click="navigateAway('/sign-in', { replace: true })"
        >
          Return to sign in
        </button>
        <button
          type="button"
          class="border-line bg-panel hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-5 text-sm font-semibold transition-colors"
          @click="navigateAway('/applications')"
        >
          Back to applications
        </button>
      </div>
    </section>

    <section
      v-else
      class="bg-surface border-line mx-auto mt-[8vh] max-w-2xl rounded-2xl border p-6 sm:p-8"
      aria-live="polite"
      aria-busy="true"
      aria-labelledby="application-loading-heading"
    >
      <h1
        id="application-loading-heading"
        class="text-2xl font-semibold tracking-[-0.03em]"
      >
        Loading your application
      </h1>
      <p class="text-muted mt-3 text-sm leading-6">
        Preparing the latest saved details.
      </p>
    </section>
  </main>
</template>
