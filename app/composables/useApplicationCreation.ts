import {
  applicationManagementEndpointErrorCodeSchema,
  type ApplicationManagementEndpointErrorCode,
} from '~~/shared/applications/errors'
import {
  createApplicationRequestSchema,
  type CreateApplicationRequest,
} from '~~/shared/applications/management'
import {
  applicationDetailResponseSchema,
  type ApplicationDetailViewModel,
} from '~~/shared/applications/view-model'

export type ApplicationCreationRecovery =
  | 'check-dashboard'
  | 'refresh-base-resumes'
  | 'retry'
  | 'review-details'
  | 'sign-in'

export interface ApplicationCreationFailure {
  code: ApplicationManagementEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationCreationRecovery
  retryable: boolean
}

export type ApplicationCreationState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { application: ApplicationDetailViewModel; status: 'success' }
  | { failure: ApplicationCreationFailure; status: 'failure' }

export interface ApplicationCreationDependencies {
  requestCreation(input: CreateApplicationRequest): Promise<unknown>
}

interface EndpointFailure {
  code: ApplicationManagementEndpointErrorCode
  statusCode: number | null
}

const defaultDependencies: ApplicationCreationDependencies = {
  requestCreation: (input) =>
    $fetch('/api/applications', {
      body: input,
      method: 'POST',
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
): ApplicationCreationFailure => ({
  code,
  message:
    "We couldn't confirm whether the application was created. Check your dashboard before trying again.",
  recovery: 'check-dashboard',
  retryable: false,
})

const createEndpointFailure = ({
  code,
}: EndpointFailure): ApplicationCreationFailure => {
  switch (code) {
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to create this application.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message:
          "We couldn't verify your session. Try creating the application again.",
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
    case 'application-save-unavailable':
    case 'application-unavailable':
    case 'applications-unavailable':
    case 'invalid-application-id':
      return createUnconfirmedFailure(code)
  }
}

const matchesCreationInput = (
  application: ApplicationDetailViewModel,
  input: CreateApplicationRequest,
): boolean =>
  application.appliedOn === null &&
  application.company === input.company &&
  application.jobDescription === input.jobDescription &&
  application.notes === input.notes &&
  application.postingUrl === input.postingUrl &&
  application.role === input.role &&
  (application.selectedBaseResume?.id ?? null) === input.selectedBaseResumeId &&
  application.status === 'draft'

export function useApplicationCreation(
  dependencies: ApplicationCreationDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationCreationState>({ status: 'idle' })
  let lastInput: CreateApplicationRequest | null = null
  let pendingCreation: Promise<ApplicationDetailViewModel | null> | null = null

  const isBusy = computed(() => state.value.status === 'creating')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable === true &&
      lastInput !== null,
  )

  const completeCreation = async (
    input: CreateApplicationRequest,
  ): Promise<ApplicationDetailViewModel | null> => {
    state.value = { status: 'creating' }
    let response: unknown

    try {
      response = await dependencies.requestCreation(input)
    } catch (error) {
      const endpointFailure = getEndpointFailure(error)

      state.value = {
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
      !matchesCreationInput(result.data.application, input)
    ) {
      state.value = {
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

  const create = (
    input: CreateApplicationRequest,
  ): Promise<ApplicationDetailViewModel | null> => {
    if (pendingCreation) {
      return pendingCreation
    }

    const parsedInput = createApplicationRequestSchema.safeParse(input)

    if (!parsedInput.success) {
      lastInput = null
      state.value = {
        failure: createEndpointFailure({
          code: 'invalid-application',
          statusCode: null,
        }),
        status: 'failure',
      }

      return Promise.resolve(null)
    }

    lastInput = parsedInput.data
    pendingCreation = completeCreation(parsedInput.data).finally(() => {
      pendingCreation = null
    })

    return pendingCreation
  }

  const retry = (): Promise<ApplicationDetailViewModel | null> => {
    if (!canRetry.value || lastInput === null) {
      return Promise.resolve(null)
    }

    return create(lastInput)
  }

  const reset = (): void => {
    if (state.value.status === 'creating') {
      return
    }

    lastInput = null
    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    create,
    isBusy,
    reset,
    retry,
    state: readonly(state),
  }
}
