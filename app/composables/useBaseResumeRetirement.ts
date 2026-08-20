import {
  baseResumeRetirementEndpointErrorCodeSchema,
  baseResumeRetirementIdSchema,
  retireBaseResumeResponseSchema,
  type BaseResumeRetirementEndpointErrorCode,
  type RetiredBaseResume,
} from '~~/shared/base-resumes/retirement'

export type BaseResumeRetirementRecovery = 'refresh' | 'retry' | 'sign-in'

export interface BaseResumeRetirementFailure {
  code: BaseResumeRetirementEndpointErrorCode | 'unknown'
  message: string
  recovery: BaseResumeRetirementRecovery
  retryable: boolean
}

export type BaseResumeRetirementState =
  | { status: 'idle' }
  | { baseResumeId: string; status: 'retiring' }
  | { baseResume: RetiredBaseResume; status: 'success' }
  | {
      baseResumeId: string
      failure: BaseResumeRetirementFailure
      status: 'failure'
    }

export interface BaseResumeRetirementDependencies {
  requestRetirement(baseResumeId: string): Promise<unknown>
}

interface EndpointFailure {
  code: BaseResumeRetirementEndpointErrorCode
  statusCode: number | null
}

const defaultDependencies: BaseResumeRetirementDependencies = {
  requestRetirement: (baseResumeId) =>
    $fetch(`/api/base-resumes/${baseResumeId}/retire`, {
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
  const code = baseResumeRetirementEndpointErrorCodeSchema.safeParse(
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

const createUnconfirmedFailure = (): BaseResumeRetirementFailure => ({
  code: 'unknown',
  message:
    "We couldn't confirm the resume's current state. Refresh your resumes before trying again.",
  recovery: 'refresh',
  retryable: false,
})

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): BaseResumeRetirementFailure => {
  switch (code) {
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to retire this resume.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message:
          "We couldn't verify your session. Try retiring the resume again.",
        recovery: 'retry',
        retryable: true,
      }
    case 'base-resume-unavailable':
      return {
        code,
        message:
          'This base resume is no longer available as an active resume. Refresh your resumes.',
        recovery: 'refresh',
        retryable: false,
      }
    case 'invalid-base-resume-id':
      return {
        code,
        message:
          'This resume could not be identified safely. Refresh your resumes before trying again.',
        recovery: 'refresh',
        retryable: false,
      }
    case 'base-resume-retirement-unavailable':
      if (statusCode === 503) {
        return {
          code,
          message: 'Resume retirement is temporarily unavailable. Try again.',
          recovery: 'retry',
          retryable: true,
        }
      }

      return createUnconfirmedFailure()
  }
}

export function useBaseResumeRetirement(
  dependencies: BaseResumeRetirementDependencies = defaultDependencies,
) {
  const state = shallowRef<BaseResumeRetirementState>({ status: 'idle' })
  let pendingRetirement: Promise<RetiredBaseResume | null> | null = null

  const isBusy = computed(() => state.value.status === 'retiring')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable === true,
  )

  const completeRetirement = async (
    baseResumeId: string,
  ): Promise<RetiredBaseResume | null> => {
    state.value = { baseResumeId, status: 'retiring' }

    let response: unknown

    try {
      response = await dependencies.requestRetirement(baseResumeId)
    } catch (error) {
      const endpointFailure = getEndpointFailure(error)

      state.value = {
        baseResumeId,
        failure: endpointFailure
          ? createEndpointFailure(endpointFailure)
          : createUnconfirmedFailure(),
        status: 'failure',
      }

      return null
    }

    const result = retireBaseResumeResponseSchema.safeParse(response)

    if (!result.success || result.data.baseResume.id !== baseResumeId) {
      state.value = {
        baseResumeId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }

      return null
    }

    state.value = {
      baseResume: result.data.baseResume,
      status: 'success',
    }

    return result.data.baseResume
  }

  const retire = (baseResumeId: string): Promise<RetiredBaseResume | null> => {
    if (pendingRetirement) {
      return pendingRetirement
    }

    const parsedId = baseResumeRetirementIdSchema.safeParse(baseResumeId)

    if (!parsedId.success) {
      state.value = {
        baseResumeId,
        failure: createEndpointFailure({
          code: 'invalid-base-resume-id',
          statusCode: null,
        }),
        status: 'failure',
      }

      return Promise.resolve(null)
    }

    pendingRetirement = completeRetirement(parsedId.data).finally(() => {
      pendingRetirement = null
    })

    return pendingRetirement
  }

  const retry = (): Promise<RetiredBaseResume | null> => {
    const currentState = state.value

    if (
      currentState.status !== 'failure' ||
      currentState.failure.retryable !== true
    ) {
      return Promise.resolve(null)
    }

    return retire(currentState.baseResumeId)
  }

  const reset = (): void => {
    if (state.value.status === 'retiring') {
      return
    }

    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    isBusy,
    reset,
    retire,
    retry,
    state: readonly(state),
  }
}
