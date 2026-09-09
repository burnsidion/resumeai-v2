<script setup lang="ts">
import ApplicationBaseResumeSelector from './ApplicationBaseResumeSelector.vue'
import ApplicationFormField from './ApplicationFormField.vue'
import ApplicationReadinessPanel from './ApplicationReadinessPanel.vue'
import type {
  ApplicationCreationRecovery,
  ApplicationCreationState,
} from '~/composables/useApplicationCreation'
import {
  MAXIMUM_APPLICATION_COMPANY_LENGTH,
  MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH,
  MAXIMUM_APPLICATION_NOTES_LENGTH,
  MAXIMUM_APPLICATION_POSTING_URL_LENGTH,
  MAXIMUM_APPLICATION_ROLE_LENGTH,
} from '~~/shared/applications/constraints'
import {
  createApplicationRequestSchema,
  type CreateApplicationRequest,
} from '~~/shared/applications/management'
import { deriveApplicationReadiness } from '~~/shared/applications/readiness'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

interface FocusableField {
  focus(): void
}

type ApplicationCreationField =
  | 'company'
  | 'jobDescription'
  | 'notes'
  | 'postingUrl'
  | 'role'
  | 'selectedBaseResumeId'

const props = defineProps<{
  baseResumes: ReadonlyArray<BaseResumeManagementItemViewModel>
  baseResumesStatus: 'error' | 'pending' | 'success'
  creationState: ApplicationCreationState
  submit(
    input: CreateApplicationRequest,
  ): Promise<ApplicationDetailViewModel | null>
}>()

const emit = defineEmits<{
  cancel: []
  'details-changed': []
  'recovery-requested': [recovery: ApplicationCreationRecovery]
  'resume-retry-requested': []
}>()

const company = ref('')
const role = ref('')
const jobDescription = ref('')
const postingUrl = ref('')
const notes = ref('')
const selectedBaseResumeId = ref<string | null>(null)
const submittingLocally = ref(false)
const fieldErrors = reactive<Partial<Record<ApplicationCreationField, string>>>(
  {},
)
const validationSummary = useTemplateRef<HTMLElement>('validationSummary')
const companyField = ref<FocusableField | null>(null)
const roleField = ref<FocusableField | null>(null)
const jobDescriptionField = ref<FocusableField | null>(null)
const postingUrlField = ref<FocusableField | null>(null)
const notesField = ref<FocusableField | null>(null)
const baseResumeField = ref<FocusableField | null>(null)

const fieldOrder = [
  'company',
  'role',
  'jobDescription',
  'postingUrl',
  'notes',
  'selectedBaseResumeId',
] as const satisfies ReadonlyArray<ApplicationCreationField>

const fieldLabels = {
  company: 'Company',
  jobDescription: 'Job description',
  notes: 'Private notes',
  postingUrl: 'Job posting URL',
  role: 'Role',
  selectedBaseResumeId: 'Base resume',
} as const satisfies Record<ApplicationCreationField, string>

const failure = computed(() =>
  props.creationState.status === 'failure' ? props.creationState.failure : null,
)
const busy = computed(
  () => props.creationState.status === 'creating' || submittingLocally.value,
)
const submissionConfirmed = computed(
  () => props.creationState.status === 'success',
)
const blocksSubmission = computed(
  () =>
    submissionConfirmed.value ||
    (failure.value !== null && failure.value.recovery !== 'review-details'),
)
const validationErrors = computed(() =>
  fieldOrder.flatMap((field) => {
    const message = fieldErrors[field]

    return message ? [{ field, label: fieldLabels[field], message }] : []
  }),
)
const selectedResumeAvailable = computed(
  () =>
    selectedBaseResumeId.value !== null &&
    props.baseResumesStatus === 'success' &&
    props.baseResumes.some(
      (resume) => resume.id === selectedBaseResumeId.value,
    ),
)
const readiness = computed(() =>
  deriveApplicationReadiness({
    jobDescription: jobDescription.value,
    selectedBaseResumeAvailable: selectedResumeAvailable.value,
  }),
)

const getFieldMessage = (field: ApplicationCreationField): string => {
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
    case 'selectedBaseResumeId':
      return 'Choose an available base resume or select no base resume.'
  }
}

const clearFieldError = (field: ApplicationCreationField): void => {
  fieldErrors[field] = undefined

  if (failure.value?.recovery === 'review-details') {
    emit('details-changed')
  }
}

const updateCompany = (value: string): void => {
  company.value = value
  clearFieldError('company')
}

const updateRole = (value: string): void => {
  role.value = value
  clearFieldError('role')
}

const updateJobDescription = (value: string): void => {
  jobDescription.value = value
  clearFieldError('jobDescription')
}

const updatePostingUrl = (value: string): void => {
  postingUrl.value = value
  clearFieldError('postingUrl')
}

const updateNotes = (value: string): void => {
  notes.value = value
  clearFieldError('notes')
}

const updateSelectedBaseResume = (value: string | null): void => {
  selectedBaseResumeId.value = value
  clearFieldError('selectedBaseResumeId')
}

const clearValidationErrors = (): void => {
  for (const field of fieldOrder) {
    fieldErrors[field] = undefined
  }
}

const focusField = async (field: ApplicationCreationField): Promise<void> => {
  await nextTick()

  const fields = {
    company: companyField,
    jobDescription: jobDescriptionField,
    notes: notesField,
    postingUrl: postingUrlField,
    role: roleField,
    selectedBaseResumeId: baseResumeField,
  } as const

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
      fieldOrder.includes(field as ApplicationCreationField)
    ) {
      const applicationField = field as ApplicationCreationField
      fieldErrors[applicationField] ??= getFieldMessage(applicationField)
    }
  }
}

const handleSubmit = async (): Promise<void> => {
  if (busy.value || blocksSubmission.value) {
    return
  }

  clearValidationErrors()

  const result = createApplicationRequestSchema.safeParse({
    company: company.value,
    jobDescription: jobDescription.value,
    notes: notes.value,
    postingUrl: postingUrl.value,
    role: role.value,
    selectedBaseResumeId: selectedBaseResumeId.value,
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
    case 'check-dashboard':
      return 'Check dashboard'
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

watch(
  [() => props.baseResumesStatus, () => props.baseResumes],
  ([status, resumes]) => {
    if (
      status === 'success' &&
      selectedBaseResumeId.value !== null &&
      !resumes.some((resume) => resume.id === selectedBaseResumeId.value)
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
    class="mt-10 grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.72fr)]"
    novalidate
    :aria-busy="busy || undefined"
    aria-label="Create application"
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
          Correct the highlighted fields before creating this application.
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
          Application creation needs attention
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
        aria-labelledby="application-essentials-heading"
      >
        <header class="mb-5 flex items-start justify-between gap-4">
          <div>
            <p
              class="text-accent text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
            >
              Step 01
            </p>
            <h2
              id="application-essentials-heading"
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
        aria-labelledby="application-context-heading"
      >
        <header class="mb-5 flex items-start justify-between gap-4">
          <div>
            <p
              class="text-accent text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
            >
              Step 02
            </p>
            <h2
              id="application-context-heading"
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
        </div>
      </section>

      <section
        class="border-line border-t p-5 sm:p-6"
        aria-labelledby="application-notes-heading"
      >
        <header class="mb-5 flex items-start justify-between gap-4">
          <div>
            <p
              class="text-accent text-[0.6875rem] font-semibold tracking-[0.14em] uppercase"
            >
              Step 03
            </p>
            <h2
              id="application-notes-heading"
              class="mt-1 text-base font-semibold tracking-[-0.02em]"
            >
              Notes
            </h2>
          </div>
          <span class="text-muted/65 text-[0.6875rem] font-medium"
            >Optional</span
          >
        </header>

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
      </section>

      <footer
        class="bg-canvas/35 border-line flex flex-col gap-4 border-t p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <p class="text-muted max-w-md text-xs leading-5">
          Saving creates a draft. Tailoring never starts automatically.
        </p>
        <div
          class="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] gap-3 sm:flex"
        >
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
            :disabled="busy || blocksSubmission"
          >
            <span
              v-if="busy"
              class="auth-spinner border-canvas/25 border-t-canvas size-4 rounded-full border-2 motion-reduce:animate-none"
              aria-hidden="true"
            />
            {{ busy ? 'Creating application…' : 'Create application' }}
          </button>
        </div>
      </footer>
    </div>

    <aside class="grid gap-4 lg:sticky lg:top-5">
      <ApplicationBaseResumeSelector
        ref="baseResumeField"
        :model-value="selectedBaseResumeId"
        :error="fieldErrors.selectedBaseResumeId"
        :items="baseResumes"
        :status="baseResumesStatus"
        :disabled="busy"
        @retry="emit('resume-retry-requested')"
        @update:model-value="updateSelectedBaseResume"
      />
      <ApplicationReadinessPanel :readiness="readiness" />
    </aside>

    <p v-if="busy" class="sr-only" role="status" aria-live="polite">
      Creating application. Keep this page open until the result is confirmed.
    </p>
  </form>
</template>
