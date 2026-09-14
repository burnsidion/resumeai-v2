<script setup lang="ts">
import ApplicationEditingForm from '~/components/applications/ApplicationEditingForm.vue'
import type { ApplicationEditingRecovery } from '~/composables/useApplicationEditing'
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

const isDirty = ref(false)
const navigationApproved = ref(false)
const savedAnnouncement = ref('')

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
onBeforeUnmount(() =>
  window.removeEventListener('beforeunload', handleBeforeUnload),
)
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
