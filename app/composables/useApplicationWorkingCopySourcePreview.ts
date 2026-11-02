import {
  baseResumePreviewResponseSchema,
  type BaseResumePreview,
} from '~~/shared/base-resumes/preview'
import { applicationIdSchema } from '~~/shared/applications/constraints'
import {
  tailoringReviewEndpointErrorCodeSchema,
  type TailoringReviewEndpointErrorCode,
} from '~~/shared/tailoring/review'

export type ApplicationWorkingCopySourcePreviewRecovery =
  'back-to-applications' | 'refresh-application' | 'retry' | 'sign-in'

export interface ApplicationWorkingCopySourcePreviewFailure {
  code: TailoringReviewEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationWorkingCopySourcePreviewRecovery
  retryable: boolean
}

export type ApplicationWorkingCopySourcePreviewState =
  | { status: 'idle' }
  | { applicationId: string; status: 'loading' }
  | { preview: BaseResumePreview; status: 'ready' }
  | {
      applicationId: string
      failure: ApplicationWorkingCopySourcePreviewFailure
      status: 'failure'
    }

export interface ApplicationWorkingCopySourcePreviewDependencies {
  requestPreview(applicationId: string): Promise<unknown>
}

interface EndpointFailure {
  code: TailoringReviewEndpointErrorCode
  statusCode: number | null
}

interface PendingPreview {
  applicationId: string
  promise: Promise<BaseResumePreview | null>
}

const defaultDependencies: ApplicationWorkingCopySourcePreviewDependencies = {
  requestPreview: (applicationId) =>
    $fetch(
      `/api/applications/${encodeURIComponent(applicationId)}/working-copy/source-preview`,
      { method: 'GET', retry: false },
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

const createUnconfirmedFailure =
  (): ApplicationWorkingCopySourcePreviewFailure => ({
    code: 'unknown',
    message:
      "We couldn't prepare a safe preview. Refresh this application before trying again.",
    recovery: 'refresh-application',
    retryable: false,
  })

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): ApplicationWorkingCopySourcePreviewFailure => {
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
          'Your session is no longer available. Sign in again to preview this source resume.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
    case 'working-copy-review-unavailable':
      return {
        code,
        message:
          statusCode === 503
            ? 'Source preview is temporarily unavailable. Try again.'
            : "We couldn't prepare a safe preview. Refresh this application before trying again.",
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

export function useApplicationWorkingCopySourcePreview(
  dependencies: ApplicationWorkingCopySourcePreviewDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationWorkingCopySourcePreviewState>({
    status: 'idle',
  })
  let activeAttempt = 0
  let pendingPreview: PendingPreview | null = null

  const completeLoad = async (
    applicationId: string,
    attempt: number,
  ): Promise<BaseResumePreview | null> => {
    state.value = { applicationId, status: 'loading' }

    let response: unknown

    try {
      response = await dependencies.requestPreview(applicationId)
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

    const result = baseResumePreviewResponseSchema.safeParse(response)

    if (!result.success) {
      state.value = {
        applicationId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }
      return null
    }

    state.value = { preview: result.data.preview, status: 'ready' }
    return result.data.preview
  }

  const load = (applicationId: string): Promise<BaseResumePreview | null> => {
    if (pendingPreview?.applicationId === applicationId) {
      return pendingPreview.promise
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
      if (pendingPreview?.applicationId === parsedId.data) {
        pendingPreview = null
      }
    })
    pendingPreview = { applicationId: parsedId.data, promise }

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

    return load(currentState.applicationId)
  }

  const reset = (): void => {
    activeAttempt += 1
    pendingPreview = null
    state.value = { status: 'idle' }
  }

  return { load, reset, retry, state: readonly(state) }
}
