import { applicationIdSchema } from '~~/shared/applications/constraints'
import {
  generateApplicationWorkingCopyResponseSchema,
  tailoringGenerationEndpointErrorCodeSchema,
  type GenerateApplicationWorkingCopyResponse,
  type TailoringGenerationEndpointErrorCode,
} from '~~/shared/tailoring/generation'

export type ApplicationTailoringRecovery =
  | 'back-to-applications'
  | 'refresh-application'
  | 'retry'
  | 'review-details'
  | 'sign-in'

export interface ApplicationTailoringFailure {
  code: TailoringGenerationEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationTailoringRecovery
  retryable: boolean
}

export type ApplicationTailoringRequestState =
  | { status: 'idle' }
  | { applicationId: string; status: 'generating' }
  | {
      applicationId: string
      response: GenerateApplicationWorkingCopyResponse
      status: 'success'
    }
  | {
      applicationId: string
      failure: ApplicationTailoringFailure
      status: 'failure'
    }

export interface ApplicationTailoringDependencies {
  requestTailoring(applicationId: string): Promise<unknown>
}

interface EndpointFailure {
  code: TailoringGenerationEndpointErrorCode
  statusCode: number | null
}

const defaultDependencies: ApplicationTailoringDependencies = {
  requestTailoring: (applicationId) =>
    $fetch(`/api/applications/${encodeURIComponent(applicationId)}/tailoring`, {
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
  const code = tailoringGenerationEndpointErrorCodeSchema.safeParse(
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

const createUnconfirmedFailure = (): ApplicationTailoringFailure => ({
  code: 'unknown',
  message:
    "We couldn't confirm whether a working copy was created. Refresh this application before trying again.",
  recovery: 'refresh-application',
  retryable: false,
})

const createEndpointFailure = ({
  code,
}: EndpointFailure): ApplicationTailoringFailure => {
  switch (code) {
    case 'application-not-ready':
      return {
        code,
        message:
          'Add a job description and select an active base resume before tailoring.',
        recovery: 'review-details',
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
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to start tailoring.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message: "We couldn't verify your session. Try tailoring again.",
        recovery: 'retry',
        retryable: true,
      }
    case 'tailoring-in-progress':
      return {
        code,
        message: 'Tailoring is already in progress for this application.',
        recovery: 'refresh-application',
        retryable: false,
      }
    case 'tailoring-unavailable':
      return {
        code,
        message: 'AI tailoring is temporarily unavailable. Try again.',
        recovery: 'retry',
        retryable: true,
      }
    case 'working-copy-immutable':
      return {
        code,
        message:
          'The current working copy can no longer be replaced. Refresh this application to see the latest state.',
        recovery: 'refresh-application',
        retryable: false,
      }
  }
}

export function useApplicationTailoring(
  dependencies: ApplicationTailoringDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationTailoringRequestState>({ status: 'idle' })
  let lastApplicationId: string | null = null
  let pendingRequest: Promise<GenerateApplicationWorkingCopyResponse | null> | null =
    null

  const isBusy = computed(() => state.value.status === 'generating')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable &&
      lastApplicationId !== null,
  )

  const completeStart = async (
    applicationId: string,
  ): Promise<GenerateApplicationWorkingCopyResponse | null> => {
    state.value = { applicationId, status: 'generating' }

    let response: unknown

    try {
      response = await dependencies.requestTailoring(applicationId)
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

    const result =
      generateApplicationWorkingCopyResponseSchema.safeParse(response)

    if (!result.success) {
      state.value = {
        applicationId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }
      return null
    }

    state.value = { applicationId, response: result.data, status: 'success' }
    return result.data
  }

  const start = (
    applicationId: string,
  ): Promise<GenerateApplicationWorkingCopyResponse | null> => {
    if (pendingRequest) {
      return pendingRequest
    }

    const parsedId = applicationIdSchema.safeParse(applicationId)

    if (!parsedId.success) {
      state.value = {
        applicationId,
        failure: {
          code: 'invalid-application-id',
          message:
            'This application could not be identified safely. Return to your applications and try again.',
          recovery: 'back-to-applications',
          retryable: false,
        },
        status: 'failure',
      }
      return Promise.resolve(null)
    }

    lastApplicationId = parsedId.data
    pendingRequest = completeStart(parsedId.data).finally(() => {
      pendingRequest = null
    })

    return pendingRequest
  }

  const retry = (): Promise<GenerateApplicationWorkingCopyResponse | null> => {
    const currentState = state.value

    if (
      currentState.status !== 'failure' ||
      currentState.failure.retryable !== true ||
      lastApplicationId === null
    ) {
      return Promise.resolve(null)
    }

    return start(lastApplicationId)
  }

  const reset = (): void => {
    if (state.value.status === 'generating') {
      return
    }

    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    isBusy,
    reset,
    retry,
    start,
    state: readonly(state),
  }
}
