import { applicationIdSchema } from '~~/shared/applications/constraints'
import {
  applicationWorkingCopyReviewResponseSchema,
  tailoringReviewEndpointErrorCodeSchema,
  type ApplicationWorkingCopyReview,
  type TailoringReviewEndpointErrorCode,
} from '~~/shared/tailoring/review'

export type ApplicationWorkingCopyReviewRecovery =
  'back-to-applications' | 'refresh-application' | 'retry' | 'sign-in'

export interface ApplicationWorkingCopyReviewFailure {
  code: TailoringReviewEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationWorkingCopyReviewRecovery
  retryable: boolean
}

export type ApplicationWorkingCopyReviewState =
  | { status: 'idle' }
  | { applicationId: string; status: 'loading' }
  | { review: ApplicationWorkingCopyReview; status: 'ready' }
  | {
      applicationId: string
      failure: ApplicationWorkingCopyReviewFailure
      status: 'failure'
    }

export interface ApplicationWorkingCopyReviewDependencies {
  requestReview(applicationId: string): Promise<unknown>
}

interface EndpointFailure {
  code: TailoringReviewEndpointErrorCode
  statusCode: number | null
}

interface PendingReview {
  applicationId: string
  promise: Promise<ApplicationWorkingCopyReview | null>
}

const defaultDependencies: ApplicationWorkingCopyReviewDependencies = {
  requestReview: (applicationId) =>
    $fetch(
      `/api/applications/${encodeURIComponent(applicationId)}/working-copy`,
      {
        method: 'GET',
        retry: false,
      },
    ),
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
  const code = tailoringReviewEndpointErrorCodeSchema.safeParse(
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

const createUnconfirmedFailure = (): ApplicationWorkingCopyReviewFailure => ({
  code: 'unknown',
  message:
    "We couldn't safely load this working copy. Refresh the application before trying again.",
  recovery: 'refresh-application',
  retryable: false,
})

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): ApplicationWorkingCopyReviewFailure => {
  switch (code) {
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
          'Your session is no longer available. Sign in again to review this working copy.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
    case 'working-copy-review-unavailable':
      return {
        code,
        message:
          statusCode === 503
            ? 'Working-copy review is temporarily unavailable. Try again.'
            : "We couldn't safely load this working copy. Refresh the application before trying again.",
        recovery: statusCode === 503 ? 'retry' : 'refresh-application',
        retryable: statusCode === 503,
      }
    case 'working-copy-unavailable':
      return {
        code,
        message:
          'This working copy is no longer available. Refresh the application to see its latest state.',
        recovery: 'refresh-application',
        retryable: false,
      }
    default:
      return createUnconfirmedFailure()
  }
}

export function useApplicationWorkingCopyReview(
  dependencies: ApplicationWorkingCopyReviewDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationWorkingCopyReviewState>({
    status: 'idle',
  })
  let activeAttempt = 0
  let pendingReview: PendingReview | null = null

  const isLoading = computed(() => state.value.status === 'loading')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable === true,
  )

  const completeLoad = async (
    applicationId: string,
    attempt: number,
  ): Promise<ApplicationWorkingCopyReview | null> => {
    state.value = { applicationId, status: 'loading' }

    let response: unknown

    try {
      response = await dependencies.requestReview(applicationId)
    } catch (error) {
      if (attempt !== activeAttempt) {
        return null
      }

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

    if (attempt !== activeAttempt) {
      return null
    }

    const result =
      applicationWorkingCopyReviewResponseSchema.safeParse(response)

    if (!result.success) {
      state.value = {
        applicationId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }
      return null
    }

    state.value = { review: result.data.review, status: 'ready' }
    return result.data.review
  }

  const load = (
    applicationId: string,
  ): Promise<ApplicationWorkingCopyReview | null> => {
    if (pendingReview?.applicationId === applicationId) {
      return pendingReview.promise
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

    const attempt = ++activeAttempt
    const promise = completeLoad(parsedId.data, attempt).finally(() => {
      if (pendingReview?.applicationId === parsedId.data) {
        pendingReview = null
      }
    })
    pendingReview = { applicationId: parsedId.data, promise }

    return promise
  }

  const retry = (): Promise<ApplicationWorkingCopyReview | null> => {
    const currentState = state.value

    if (
      currentState.status !== 'failure' ||
      currentState.failure.retryable !== true
    ) {
      return Promise.resolve(null)
    }

    return load(currentState.applicationId)
  }

  const reset = (): void => {
    activeAttempt += 1
    pendingReview = null
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
