import { applicationIdSchema } from '~~/shared/applications/constraints'
import {
  applicationManagementEndpointErrorCodeSchema,
  type ApplicationManagementEndpointErrorCode,
} from '~~/shared/applications/errors'
import {
  updateApplicationRequestSchema,
  type UpdateApplicationRequest,
} from '~~/shared/applications/management'
import {
  applicationDetailResponseSchema,
  type ApplicationDetailViewModel,
} from '~~/shared/applications/view-model'

export type ApplicationEditingRecovery =
  | 'back-to-applications'
  | 'refresh-application'
  | 'refresh-base-resumes'
  | 'retry'
  | 'review-details'
  | 'sign-in'

export interface ApplicationEditingFailure {
  code: ApplicationManagementEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationEditingRecovery
  retryable: boolean
}

export type ApplicationEditingState =
  | { status: 'idle' }
  | { applicationId: string; status: 'saving' }
  | { application: ApplicationDetailViewModel; status: 'success' }
  | {
      applicationId: string
      failure: ApplicationEditingFailure
      status: 'failure'
    }

export interface ApplicationEditingDependencies {
  requestUpdate(
    applicationId: string,
    input: UpdateApplicationRequest,
  ): Promise<unknown>
}

interface EndpointFailure {
  code: ApplicationManagementEndpointErrorCode
  statusCode: number | null
}

interface PendingUpdate {
  applicationId: string
  input: UpdateApplicationRequest
}

const defaultDependencies: ApplicationEditingDependencies = {
  requestUpdate: (applicationId, input) =>
    $fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
      body: input,
      method: 'PATCH',
      retry: false,
    }),
}

const getEndpointFailure = (error: unknown): EndpointFailure | null => {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const response = error as {
    data?: { data?: { code?: unknown } }
    status?: unknown
    statusCode?: unknown
  }
  const code = applicationManagementEndpointErrorCodeSchema.safeParse(
    response.data?.data?.code,
  )
  const rawStatusCode = response.statusCode ?? response.status

  if (!code.success) {
    return null
  }

  return {
    code: code.data,
    statusCode:
      typeof rawStatusCode === 'number' && Number.isInteger(rawStatusCode)
        ? rawStatusCode
        : null,
  }
}

const createUnconfirmedFailure = (
  code: ApplicationManagementEndpointErrorCode | 'unknown' = 'unknown',
): ApplicationEditingFailure => ({
  code,
  message:
    "We couldn't confirm whether your changes were saved. Reload the application before trying again.",
  recovery: 'refresh-application',
  retryable: false,
})

const createEndpointFailure = ({
  code,
}: EndpointFailure): ApplicationEditingFailure => {
  switch (code) {
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to update this application.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message:
          "We couldn't verify your session. Try saving these changes again.",
        recovery: 'retry',
        retryable: true,
      }
    case 'invalid-application':
      return {
        code,
        message:
          'Review the application details and correct any invalid information.',
        recovery: 'review-details',
        retryable: false,
      }
    case 'selected-base-resume-unavailable':
      return {
        code,
        message:
          'The selected base resume is no longer available. Refresh your resumes and choose again.',
        recovery: 'refresh-base-resumes',
        retryable: false,
      }
    case 'application-update-conflict':
      return {
        code,
        message:
          'This application changed after you opened it. Reload the latest version before editing again.',
        recovery: 'refresh-application',
        retryable: false,
      }
    case 'application-unavailable':
    case 'invalid-application-id':
      return {
        code,
        message: 'This application is no longer available.',
        recovery: 'back-to-applications',
        retryable: false,
      }
    case 'application-save-unavailable':
    case 'application-deletion-unavailable':
      return createUnconfirmedFailure(code)
    case 'applications-unavailable':
      return createUnconfirmedFailure(code)
  }
}

const matchesUpdateInput = (
  application: ApplicationDetailViewModel,
  applicationId: string,
  input: UpdateApplicationRequest,
): boolean => {
  const requestedFieldsMatch =
    (input.appliedOn === undefined ||
      application.appliedOn === input.appliedOn) &&
    (input.company === undefined || application.company === input.company) &&
    (input.jobDescription === undefined ||
      application.jobDescription === input.jobDescription) &&
    (input.notes === undefined || application.notes === input.notes) &&
    (input.postingUrl === undefined ||
      application.postingUrl === input.postingUrl) &&
    (input.role === undefined || application.role === input.role) &&
    (input.selectedBaseResumeId === undefined ||
      (application.selectedBaseResume?.id ?? null) ===
        input.selectedBaseResumeId) &&
    (input.status === undefined || application.status === input.status)

  return (
    application.id === applicationId &&
    requestedFieldsMatch &&
    Date.parse(application.updatedAt) > Date.parse(input.expectedUpdatedAt)
  )
}

export function useApplicationEditing(
  dependencies: ApplicationEditingDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationEditingState>({ status: 'idle' })
  let lastUpdate: PendingUpdate | null = null
  let pendingSave: Promise<ApplicationDetailViewModel | null> | null = null

  const isBusy = computed(() => state.value.status === 'saving')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable &&
      lastUpdate !== null,
  )

  const completeSave = async (
    applicationId: string,
    input: UpdateApplicationRequest,
  ): Promise<ApplicationDetailViewModel | null> => {
    state.value = { applicationId, status: 'saving' }
    let response: unknown

    try {
      response = await dependencies.requestUpdate(applicationId, input)
    } catch (error) {
      const endpointFailure = getEndpointFailure(error)

      state.value = {
        applicationId,
        failure: endpointFailure
          ? createEndpointFailure(endpointFailure)
          : createUnconfirmedFailure(),
        status: 'failure',
      }

      return null
    }

    const result = applicationDetailResponseSchema.safeParse(response)

    if (
      !result.success ||
      !matchesUpdateInput(result.data.application, applicationId, input)
    ) {
      state.value = {
        applicationId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }

      return null
    }

    state.value = {
      application: result.data.application,
      status: 'success',
    }

    return result.data.application
  }

  const save = (
    applicationId: string,
    input: UpdateApplicationRequest,
  ): Promise<ApplicationDetailViewModel | null> => {
    if (pendingSave) {
      return pendingSave
    }

    const parsedId = applicationIdSchema.safeParse(applicationId)
    const parsedInput = updateApplicationRequestSchema.safeParse(input)

    if (!parsedId.success || !parsedInput.success) {
      lastUpdate = null
      state.value = {
        applicationId,
        failure: createEndpointFailure({
          code: parsedId.success
            ? 'invalid-application'
            : 'invalid-application-id',
          statusCode: null,
        }),
        status: 'failure',
      }

      return Promise.resolve(null)
    }

    lastUpdate = { applicationId: parsedId.data, input: parsedInput.data }
    pendingSave = completeSave(parsedId.data, parsedInput.data).finally(() => {
      pendingSave = null
    })

    return pendingSave
  }

  const retry = (): Promise<ApplicationDetailViewModel | null> => {
    if (!canRetry.value || lastUpdate === null) {
      return Promise.resolve(null)
    }

    return save(lastUpdate.applicationId, lastUpdate.input)
  }

  const reset = (): void => {
    if (state.value.status === 'saving') {
      return
    }

    lastUpdate = null
    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    isBusy,
    reset,
    retry,
    save,
    state: readonly(state),
  }
}
