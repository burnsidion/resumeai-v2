<script setup lang="ts">
import type { DeepReadonly } from 'vue'

import ApplicationBaseResumeSelector from './ApplicationBaseResumeSelector.vue'
import ApplicationFormField from './ApplicationFormField.vue'
import ApplicationReadinessPanel from './ApplicationReadinessPanel.vue'
import type {
  ApplicationEditingRecovery,
  ApplicationEditingState,
} from '~/composables/useApplicationEditing'
import {
  APPLICATION_STATUSES,
  MAXIMUM_APPLICATION_COMPANY_LENGTH,
  MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH,
  MAXIMUM_APPLICATION_NOTES_LENGTH,
  MAXIMUM_APPLICATION_POSTING_URL_LENGTH,
  MAXIMUM_APPLICATION_ROLE_LENGTH,
  type ApplicationStatus,
} from '~~/shared/applications/constraints'
import {
  updateApplicationRequestSchema,
  type UpdateApplicationRequest,
} from '~~/shared/applications/management'
import { deriveApplicationReadiness } from '~~/shared/applications/readiness'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

interface FocusableField {
  focus(): void
}

type ApplicationEditingField =
  | 'appliedOn'
  | 'company'
  | 'jobDescription'
  | 'notes'
  | 'postingUrl'
  | 'role'
  | 'selectedBaseResumeId'
  | 'status'

const props = defineProps<{
  application: ApplicationDetailViewModel
  baseResumes: ReadonlyArray<BaseResumeManagementItemViewModel>
  baseResumesStatus: 'error' | 'pending' | 'success'
  editingState: DeepReadonly<ApplicationEditingState>
  submit(
    input: UpdateApplicationRequest,
  ): Promise<ApplicationDetailViewModel | null>
}>()

const emit = defineEmits<{
  cancel: []
  'details-changed': []
  'dirty-changed': [dirty: boolean]
  'recovery-requested': [recovery: ApplicationEditingRecovery]
  'resume-retry-requested': []
}>()

const statusOptions = APPLICATION_STATUSES.map((value) => ({
  label:
    value === 'interviewing'
      ? 'Interviewing'
      : `${value.charAt(0).toLocaleUpperCase('en-US')}${value.slice(1)}`,
  value,
}))

const initialValues = {
  appliedOn: props.application.appliedOn ?? '',
  company: props.application.company,
  jobDescription: props.application.jobDescription ?? '',
  notes: props.application.notes ?? '',
  postingUrl: props.application.postingUrl ?? '',
  role: props.application.role,
  selectedBaseResumeId: props.application.selectedBaseResume?.id ?? null,
  status: props.application.status,
} as const

const appliedOn = ref(initialValues.appliedOn)
const company = ref(initialValues.company)
const jobDescription = ref(initialValues.jobDescription)
const notes = ref(initialValues.notes)
const postingUrl = ref(initialValues.postingUrl)
const role = ref(initialValues.role)
const selectedBaseResumeId = ref<string | null>(
  initialValues.selectedBaseResumeId,
)
const status = ref<ApplicationStatus>(initialValues.status)
const submittingLocally = ref(false)
const fieldErrors = reactive<Partial<Record<ApplicationEditingField, string>>>(
  {},
)
const validationSummary = useTemplateRef<HTMLElement>('validationSummary')
const appliedOnField = ref<FocusableField | null>(null)
const baseResumeField = ref<FocusableField | null>(null)
const companyField = ref<FocusableField | null>(null)
const jobDescriptionField = ref<FocusableField | null>(null)
const notesField = ref<FocusableField | null>(null)
const postingUrlField = ref<FocusableField | null>(null)
const roleField = ref<FocusableField | null>(null)
const statusField = useTemplateRef<HTMLSelectElement>('statusField')

const fieldOrder = [
  'company',
  'role',
  'status',
  'appliedOn',
  'jobDescription',
  'postingUrl',
  'notes',
  'selectedBaseResumeId',
] as const satisfies ReadonlyArray<ApplicationEditingField>

const fieldLabels = {
  appliedOn: 'Applied date',
  company: 'Company',
  jobDescription: 'Job description',
  notes: 'Private notes',
  postingUrl: 'Job posting URL',
  role: 'Role',
  selectedBaseResumeId: 'Base resume',
  status: 'Tracking status',
} as const satisfies Record<ApplicationEditingField, string>

const failure = computed(() =>
  props.editingState.status === 'failure' ? props.editingState.failure : null,
)
const busy = computed(
  () => props.editingState.status === 'saving' || submittingLocally.value,
)
const submissionConfirmed = computed(
  () => props.editingState.status === 'success',
)
const blocksSubmission = computed(
  () =>
    submissionConfirmed.value ||
    (failure.value !== null && failure.value.recovery !== 'review-details'),
)
const isDirty = computed(
  () =>
    appliedOn.value !== initialValues.appliedOn ||
    company.value !== initialValues.company ||
    jobDescription.value !== initialValues.jobDescription ||
    notes.value !== initialValues.notes ||
    postingUrl.value !== initialValues.postingUrl ||
    role.value !== initialValues.role ||
    selectedBaseResumeId.value !== initialValues.selectedBaseResumeId ||
    status.value !== initialValues.status,
)
const validationErrors = computed(() =>
  fieldOrder.flatMap((field) => {
    const message = fieldErrors[field]

    return message ? [{ field, label: fieldLabels[field], message }] : []
  }),
)
const currentSelection = computed<
  ApplicationDetailViewModel['selectedBaseResume']
>(() => {
  const selection = props.application.selectedBaseResume

  if (
    selection === null ||
    selection.id !== selectedBaseResumeId.value ||
    props.baseResumesStatus !== 'success' ||
    props.baseResumes.some((resume) => resume.id === selection.id)
  ) {
    return selection
  }

  return {
    availabilityLabel: 'Unavailable',
    filename: selection.filename,
    id: selection.id,
    isAvailable: false,
  }
})
const selectedResumeAvailable = computed(() => {
  if (selectedBaseResumeId.value === null) {
    return false
  }

  if (props.baseResumesStatus === 'success') {
    return props.baseResumes.some(
      (resume) => resume.id === selectedBaseResumeId.value,
    )
  }

  return (
    props.application.selectedBaseResume?.id === selectedBaseResumeId.value &&
    props.application.selectedBaseResume.isAvailable
  )
})
const readiness = computed(() =>
  deriveApplicationReadiness({
    jobDescription: jobDescription.value,
    selectedBaseResumeAvailable: selectedResumeAvailable.value,
  }),
)

const getFieldMessage = (field: ApplicationEditingField): string => {
  switch (field) {
    case 'company':
      return company.value.trim()
        ? `Keep the company name to ${MAXIMUM_APPLICATION_COMPANY_LENGTH} characters or fewer.`
        : 'Enter a company name.'
    case 'role':
      return role.value.trim()
        ? `Keep the role to ${MAXIMUM_APPLICATION_ROLE_LENGTH} characters or fewer.`
        : 'Enter a role or position title.'
    case 'jobDescription':
      return `Keep the job description to ${MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH.toLocaleString('en-US')} characters or fewer.`
    case 'postingUrl':
      return `Enter a complete HTTP or HTTPS URL no longer than ${MAXIMUM_APPLICATION_POSTING_URL_LENGTH.toLocaleString('en-US')} characters.`
    case 'notes':
      return `Keep private notes to ${MAXIMUM_APPLICATION_NOTES_LENGTH.toLocaleString('en-US')} characters or fewer.`
    case 'appliedOn':
      return 'Enter a valid applied date.'
    case 'selectedBaseResumeId':
      return 'Choose an available base resume or select no base resume.'
    case 'status':
      return 'Choose a supported tracking status.'
  }
}

const clearFieldError = (field: ApplicationEditingField): void => {
  fieldErrors[field] = undefined

  if (failure.value?.recovery === 'review-details') {
    emit('details-changed')
  }
}

const updateAppliedOn = (value: string): void => {
  appliedOn.value = value
  clearFieldError('appliedOn')
}

const updateCompany = (value: string): void => {
  company.value = value
  clearFieldError('company')
}

const updateJobDescription = (value: string): void => {
  jobDescription.value = value
  clearFieldError('jobDescription')
}

const updateNotes = (value: string): void => {
  notes.value = value
  clearFieldError('notes')
}

const updatePostingUrl = (value: string): void => {
  postingUrl.value = value
  clearFieldError('postingUrl')
}

const updateRole = (value: string): void => {
  role.value = value
  clearFieldError('role')
}

const updateSelectedBaseResume = (value: string | null): void => {
  selectedBaseResumeId.value = value
  clearFieldError('selectedBaseResumeId')
}

const updateStatus = (event: Event): void => {
  status.value = (event.target as HTMLSelectElement).value as ApplicationStatus
  clearFieldError('status')
}

const clearValidationErrors = (): void => {
  for (const field of fieldOrder) {
    fieldErrors[field] = undefined
  }
}

const focusField = async (field: ApplicationEditingField): Promise<void> => {
  await nextTick()

  const fields = {
    appliedOn: appliedOnField,
    company: companyField,
    jobDescription: jobDescriptionField,
    notes: notesField,
    postingUrl: postingUrlField,
    role: roleField,
    selectedBaseResumeId: baseResumeField,
  } as const

  if (field === 'status') {
    statusField.value?.focus()
    return
  }

  fields[field]?.value?.focus()
}

const focusValidationErrors = async (): Promise<void> => {
  const errors = validationErrors.value

  if (errors.length > 1) {
    await nextTick()
    validationSummary.value?.focus()
    return
  }

  const firstError = errors[0]

  if (firstError) {
    await focusField(firstError.field)
  }
}

const setValidationErrors = (
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
): void => {
  for (const issue of issues) {
    const field = issue.path[0]

    if (
      typeof field === 'string' &&
      fieldOrder.includes(field as ApplicationEditingField)
    ) {
      const applicationField = field as ApplicationEditingField
      fieldErrors[applicationField] ??= getFieldMessage(applicationField)
    }
  }
}

const handleSubmit = async (): Promise<void> => {
  if (!isDirty.value || busy.value || blocksSubmission.value) {
    return
  }

  clearValidationErrors()

  const result = updateApplicationRequestSchema.safeParse({
    appliedOn: appliedOn.value || null,
    company: company.value,
    expectedUpdatedAt: props.application.updatedAt,
    jobDescription: jobDescription.value,
    notes: notes.value,
    postingUrl: postingUrl.value,
    role: role.value,
    selectedBaseResumeId: selectedBaseResumeId.value,
    status: status.value,
  })

  if (!result.success) {
    setValidationErrors(result.error.issues)
    await focusValidationErrors()
    return
  }

  submittingLocally.value = true

  try {
    await props.submit(result.data)
  } finally {
    submittingLocally.value = false
  }
}

const requestRecovery = (): void => {
  if (failure.value) {
    emit('recovery-requested', failure.value.recovery)
  }
}

const recoveryLabel = computed(() => {
  switch (failure.value?.recovery) {
    case 'back-to-applications':
      return 'Back to applications'
    case 'refresh-application':
      return 'Reload application'
    case 'refresh-base-resumes':
      return 'Refresh resumes'
    case 'retry':
      return 'Try again'
    case 'sign-in':
      return 'Return to sign in'
    case 'review-details':
    case undefined:
      return null
  }

  return null
})

watch(isDirty, (dirty) => emit('dirty-changed', dirty), { immediate: true })

watch(
  [() => props.baseResumesStatus, () => props.baseResumes],
  ([resumeStatus, resumes]) => {
    const selectedId = selectedBaseResumeId.value

    if (
      resumeStatus === 'success' &&
      selectedId !== null &&
      selectedId !== initialValues.selectedBaseResumeId &&
      !resumes.some((resume) => resume.id === selectedId)
    ) {
      selectedBaseResumeId.value = null
      fieldErrors.selectedBaseResumeId =
        'The selected base resume is no longer available. Choose another resume or continue without one.'
    }
  },
)
</script>

<template>
  <form
    class="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.72fr)]"
    novalidate
    :aria-busy="busy || undefined"
    aria-label="Edit application"
    @submit.prevent="handleSubmit"
  >
    <div class="bg-surface border-line overflow-hidden rounded-2xl border">
      <div
        v-if="validationErrors.length > 1"
        ref="validationSummary"
        role="alert"
        tabindex="-1"
        class="border-danger/30 bg-danger/[0.06] m-5 rounded-xl border p-4 outline-none focus-visible:outline-2 sm:m-6"
      >
        <h2 class="text-sm font-semibold">
          {{ validationErrors.length }} details need your attention
        </h2>
        <p class="text-muted mt-1 text-xs leading-5">
          Correct the highlighted fields before saving these changes.
        </p>
        <ul class="mt-3 space-y-1.5">
          <li v-for="error in validationErrors" :key="error.field">
            <button
              type="button"
              class="text-danger focus-visible:outline-focus rounded text-left text-xs font-medium underline-offset-4 hover:underline"
              @click="focusField(error.field)"
            >
              {{ error.label }}: {{ error.message }}
            </button>
          </li>
        </ul>
      </div>

      <div
        v-if="failure"
        class="border-danger/30 bg-danger/[0.055] m-5 rounded-xl border p-4 sm:m-6"
        role="alert"
      >
        <h2 class="text-sm font-semibold">
          Application update needs attention
        </h2>
        <p class="text-muted mt-1 text-xs leading-5">
          {{ failure.message }}
        </p>
        <button
          v-if="recoveryLabel"
          type="button"
          class="text-accent focus-visible:outline-focus mt-3 min-h-10 rounded-lg text-xs font-semibold"
          :disabled="busy"
          @click="requestRecovery"
        >
          {{ recoveryLabel }}
        </button>
      </div>

      <section
        class="p-5 sm:p-6"
        aria-labelledby="application-edit-essentials-heading"
      >
        <header class="mb-5 flex items-start justify-between gap-4">
          <div>
            <p
              class="text-accent text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
            >
              Application
            </p>
            <h2
              id="application-edit-essentials-heading"
              class="mt-1 text-base font-semibold tracking-[-0.02em]"
            >
              Essentials
            </h2>
          </div>
          <span class="text-muted/65 text-[0.6875rem] font-medium"
            >Required</span
          >
        </header>

        <div class="grid gap-4 sm:grid-cols-2">
          <ApplicationFormField
            id="application-company"
            ref="companyField"
            :model-value="company"
            autocomplete="organization"
            label="Company"
            name="company"
            :disabled="busy"
            :error="fieldErrors.company"
            :maxlength="MAXIMUM_APPLICATION_COMPANY_LENGTH"
            @update:model-value="updateCompany"
          />
          <ApplicationFormField
            id="application-role"
            ref="roleField"
            :model-value="role"
            autocomplete="organization-title"
            label="Role"
            name="role"
            :disabled="busy"
            :error="fieldErrors.role"
            :maxlength="MAXIMUM_APPLICATION_ROLE_LENGTH"
            @update:model-value="updateRole"
          />
        </div>
      </section>

      <section
        class="border-line border-t p-5 sm:p-6"
        aria-labelledby="application-edit-tracking-heading"
      >
        <header class="mb-5">
          <p
            class="text-accent text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
          >
            Progress
          </p>
          <h2
            id="application-edit-tracking-heading"
            class="mt-1 text-base font-semibold tracking-[-0.02em]"
          >
            Tracking
          </h2>
        </header>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid min-w-0 gap-2">
            <label
              for="application-status"
              class="w-fit text-xs font-semibold sm:text-sm"
            >
              Tracking status
            </label>
            <select
              id="application-status"
              ref="statusField"
              name="status"
              :value="status"
              :disabled="busy"
              :aria-invalid="fieldErrors.status ? 'true' : undefined"
              :aria-describedby="
                fieldErrors.status ? 'application-status-error' : undefined
              "
              class="bg-canvas/65 text-foreground border-line hover:border-muted/50 focus:border-focus focus:ring-focus/15 disabled:bg-high/50 disabled:text-muted min-h-12 w-full rounded-xl border px-3.5 text-sm transition-[border-color,box-shadow,background-color] focus:ring-4 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              :class="
                fieldErrors.status
                  ? 'border-danger/70 ring-danger/10 ring-4'
                  : undefined
              "
              @change="updateStatus"
            >
              <option
                v-for="option in statusOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <p
              v-if="fieldErrors.status"
              id="application-status-error"
              class="text-danger text-xs leading-5 font-medium"
            >
              {{ fieldErrors.status }}
            </p>
          </div>

          <ApplicationFormField
            id="application-applied-on"
            ref="appliedOnField"
            :model-value="appliedOn"
            label="Applied date"
            name="applied-on"
            optional
            type="date"
            hint="This date does not change the tracking status automatically."
            :disabled="busy"
            :error="fieldErrors.appliedOn"
            @update:model-value="updateAppliedOn"
          />
        </div>
      </section>

      <section
        class="border-line border-t p-5 sm:p-6"
        aria-labelledby="application-edit-context-heading"
      >
        <header class="mb-5 flex items-start justify-between gap-4">
          <div>
            <p
              class="text-accent text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
            >
              Preparation
            </p>
            <h2
              id="application-edit-context-heading"
              class="mt-1 text-base font-semibold tracking-[-0.02em]"
            >
              Job context
            </h2>
          </div>
          <span class="text-muted/65 text-[0.6875rem] font-medium"
            >Optional</span
          >
        </header>

        <div class="grid gap-4">
          <ApplicationFormField
            id="application-job-description"
            ref="jobDescriptionField"
            :model-value="jobDescription"
            label="Job description"
            name="job-description"
            optional
            multiline
            :rows="8"
            hint="A job description is needed before tailoring can begin."
            placeholder="Paste the job description when you have it."
            :disabled="busy"
            :error="fieldErrors.jobDescription"
            :maxlength="MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH"
            @update:model-value="updateJobDescription"
          />
          <ApplicationFormField
            id="application-posting-url"
            ref="postingUrlField"
            :model-value="postingUrl"
            inputmode="url"
            label="Job posting URL"
            name="posting-url"
            optional
            type="url"
            placeholder="https://company.com/jobs/..."
            :disabled="busy"
            :error="fieldErrors.postingUrl"
            :maxlength="MAXIMUM_APPLICATION_POSTING_URL_LENGTH"
            @update:model-value="updatePostingUrl"
          />
          <ApplicationFormField
            id="application-notes"
            ref="notesField"
            :model-value="notes"
            label="Private notes"
            name="notes"
            optional
            multiline
            :rows="4"
            hint="Only you can see these notes."
            :disabled="busy"
            :error="fieldErrors.notes"
            :maxlength="MAXIMUM_APPLICATION_NOTES_LENGTH"
            @update:model-value="updateNotes"
          />
        </div>
      </section>

      <footer
        class="bg-canvas/35 border-line flex flex-col gap-4 border-t p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <p class="text-muted max-w-md text-xs leading-5" aria-live="polite">
          {{ isDirty ? 'Unsaved changes' : 'No changes to save' }}
        </p>
        <div class="grid grid-cols-2 gap-3 sm:flex">
          <button
            type="button"
            class="border-line bg-panel text-foreground hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-50"
            :disabled="busy || submissionConfirmed"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="bg-accent text-canvas focus-visible:outline-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            :disabled="!isDirty || busy || blocksSubmission"
          >
            <span
              v-if="busy"
              class="auth-spinner border-canvas/25 border-t-canvas size-4 rounded-full border-2 motion-reduce:animate-none"
              aria-hidden="true"
            />
            {{ busy ? 'Saving changes…' : 'Save changes' }}
          </button>
        </div>
      </footer>
    </div>

    <aside class="grid gap-4 lg:sticky lg:top-5">
      <ApplicationBaseResumeSelector
        ref="baseResumeField"
        :model-value="selectedBaseResumeId"
        :current-selection="currentSelection"
        :error="fieldErrors.selectedBaseResumeId"
        :items="baseResumes"
        :status="baseResumesStatus"
        :disabled="busy"
        @retry="emit('resume-retry-requested')"
        @update:model-value="updateSelectedBaseResume"
      />
      <ApplicationReadinessPanel context="editing" :readiness="readiness" />
    </aside>

    <p v-if="busy" class="sr-only" role="status" aria-live="polite">
      Saving application changes. Keep this page open until the result is
      confirmed.
    </p>
  </form>
</template>
