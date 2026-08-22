import {
  baseResumePreviewEndpointErrorCodeSchema,
  baseResumePreviewIdSchema,
  baseResumePreviewResponseSchema,
  type BaseResumePreview,
  type BaseResumePreviewEndpointErrorCode,
} from '~~/shared/base-resumes/preview'

export type BaseResumePreviewRecovery = 'refresh' | 'retry' | 'sign-in'

export interface BaseResumePreviewFailure {
  code: BaseResumePreviewEndpointErrorCode | 'unknown'
  message: string
  recovery: BaseResumePreviewRecovery
  retryable: boolean
}

export type BaseResumePreviewState =
  | { status: 'idle' }
  | { baseResumeId: string; status: 'loading' }
  | { preview: BaseResumePreview; status: 'ready' }
  | {
      baseResumeId: string
      failure: BaseResumePreviewFailure
      status: 'failure'
    }

export interface BaseResumePreviewDependencies {
  requestPreview(baseResumeId: string): Promise<unknown>
}

interface EndpointFailure {
  code: BaseResumePreviewEndpointErrorCode
  statusCode: number | null
}

interface PendingPreview {
  attempt: number
  promise: Promise<BaseResumePreview | null>
}

const defaultDependencies: BaseResumePreviewDependencies = {
  requestPreview: (baseResumeId) =>
    $fetch(`/api/base-resumes/${baseResumeId}/preview`, {
      method: 'GET',
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
  const code = baseResumePreviewEndpointErrorCodeSchema.safeParse(
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

const createUnconfirmedFailure = (): BaseResumePreviewFailure => ({
  code: 'unknown',
  message:
    "We couldn't prepare a safe preview. Refresh your resumes before trying again.",
  recovery: 'refresh',
  retryable: false,
})

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): BaseResumePreviewFailure => {
  switch (code) {
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to preview this resume.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message:
          "We couldn't verify your session. Try opening the preview again.",
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
    case 'base-resume-preview-unavailable':
      if (statusCode === 503) {
        return {
          code,
          message: 'Resume preview is temporarily unavailable. Try again.',
          recovery: 'retry',
          retryable: true,
        }
      }

      return createUnconfirmedFailure()
  }
}

export function useBaseResumePreview(
  dependencies: BaseResumePreviewDependencies = defaultDependencies,
) {
  const state = shallowRef<BaseResumePreviewState>({ status: 'idle' })
  let activeAttempt = 0
  let pendingPreview: PendingPreview | null = null

  const isLoading = computed(() => state.value.status === 'loading')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable === true,
  )

  const completePreview = async (
    baseResumeId: string,
    attempt: number,
  ): Promise<BaseResumePreview | null> => {
    state.value = { baseResumeId, status: 'loading' }

    let response: unknown

    try {
      response = await dependencies.requestPreview(baseResumeId)
    } catch (error) {
      if (attempt !== activeAttempt) {
        return null
      }

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

    if (attempt !== activeAttempt) {
      return null
    }

    const result = baseResumePreviewResponseSchema.safeParse(response)

    if (!result.success || result.data.preview.baseResumeId !== baseResumeId) {
      state.value = {
        baseResumeId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }

      return null
    }

    state.value = {
      preview: result.data.preview,
      status: 'ready',
    }

    return result.data.preview
  }

  const load = (baseResumeId: string): Promise<BaseResumePreview | null> => {
    if (pendingPreview) {
      return pendingPreview.promise
    }

    const parsedId = baseResumePreviewIdSchema.safeParse(baseResumeId)

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

    const attempt = ++activeAttempt
    const promise = completePreview(parsedId.data, attempt).finally(() => {
      if (pendingPreview?.attempt === attempt) {
        pendingPreview = null
      }
    })
    pendingPreview = { attempt, promise }

    return promise
  }

  const retry = (): Promise<BaseResumePreview | null> => {
    const currentState = state.value

    if (
      currentState.status !== 'failure' ||
      currentState.failure.retryable !== true
    ) {
      return Promise.resolve(null)
    }

    return load(currentState.baseResumeId)
  }

  const reset = (): void => {
    activeAttempt += 1
    pendingPreview = null
    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    isLoading,
    load,
    reset,
    retry,
    state: readonly(state),
  }
}
