import { z } from 'zod'

import { applicationIdSchema } from '~~/shared/applications/constraints'
import {
  discardWorkingCopyResponseSchema,
  tailoringReviewEndpointErrorCodeSchema,
  workingCopyLifecycleResponseSchema,
  type TailoringReviewEndpointErrorCode,
} from '~~/shared/tailoring/review'
import {
  requestWorkingCopyRevisionSchema,
  type RequestWorkingCopyRevision,
} from '~~/shared/tailoring/revision'

export type ApplicationWorkingCopyAction = 'accept' | 'discard' | 'revision'
export type ApplicationWorkingCopyActionRecovery =
  'back-to-applications' | 'refresh-application' | 'retry' | 'sign-in'

export interface ApplicationWorkingCopyActionFailure {
  code: TailoringReviewEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationWorkingCopyActionRecovery
  retryable: boolean
}

export type ApplicationWorkingCopyActionState =
  | { status: 'idle' }
  | {
      action: ApplicationWorkingCopyAction
      applicationId: string
      status: 'submitting'
    }
  | {
      action: ApplicationWorkingCopyAction
      applicationId: string
      status: 'success'
    }
  | {
      action: ApplicationWorkingCopyAction
      applicationId: string
      failure: ApplicationWorkingCopyActionFailure
      status: 'failure'
    }

export interface ApplicationWorkingCopyActionsDependencies {
  requestAccept(applicationId: string): Promise<unknown>
  requestDiscard(applicationId: string): Promise<unknown>
  requestRevision(
    applicationId: string,
    request: RequestWorkingCopyRevision,
  ): Promise<unknown>
}

interface EndpointFailure {
  code: TailoringReviewEndpointErrorCode
  statusCode: number | null
}

interface ActionRequest {
  action: ApplicationWorkingCopyAction
  applicationId: string
  expectedWorkingCopyId: string
  expectedRevisionNumber: number
  revision?: RequestWorkingCopyRevision
}

const workingCopyIdSchema = z.uuid()
const revisionNumberSchema = z.number().int().positive()

const defaultDependencies: ApplicationWorkingCopyActionsDependencies = {
  requestAccept: (applicationId) =>
    $fetch(
      `/api/applications/${encodeURIComponent(applicationId)}/working-copy/accept`,
      { method: 'POST', retry: false },
    ),
  requestDiscard: (applicationId) =>
    $fetch(
      `/api/applications/${encodeURIComponent(applicationId)}/working-copy`,
      {
        method: 'DELETE',
        retry: false,
      },
    ),
  requestRevision: (applicationId, request) =>
    $fetch(
      `/api/applications/${encodeURIComponent(applicationId)}/working-copy/revision`,
      { body: request, method: 'POST', retry: false },
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

const createUnconfirmedFailure = (): ApplicationWorkingCopyActionFailure => ({
  code: 'unknown',
  message:
    "We couldn't confirm the working copy's current state. Refresh the application before trying again.",
  recovery: 'refresh-application',
  retryable: false,
})

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): ApplicationWorkingCopyActionFailure => {
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
          'Your session is no longer available. Sign in again to update this working copy.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
    case 'tailoring-unavailable':
      return {
        code,
        message: 'Working-copy updates are temporarily unavailable. Try again.',
        recovery: 'retry',
        retryable: true,
      }
    case 'tailoring-in-progress':
    case 'working-copy-already-exists':
    case 'working-copy-immutable':
    case 'working-copy-unavailable':
      return {
        code,
        message:
          'This working copy changed elsewhere. Refresh the application to see its latest state.',
        recovery: 'refresh-application',
        retryable: false,
      }
    case 'invalid-revision-request':
      return {
        code,
        message:
          'Your revision request could not be used safely. Review it and try again.',
        recovery: 'refresh-application',
        retryable: false,
      }
    case 'working-copy-lifecycle-unavailable':
      return statusCode === 503
        ? {
            code,
            message:
              'Working-copy updates are temporarily unavailable. Try again.',
            recovery: 'retry',
            retryable: true,
          }
        : createUnconfirmedFailure()
    case 'working-copy-review-unavailable':
      return createUnconfirmedFailure()
  }
}

const validateActionRequest = (
  request: ActionRequest,
): ActionRequest | null => {
  const applicationId = applicationIdSchema.safeParse(request.applicationId)
  const workingCopyId = workingCopyIdSchema.safeParse(
    request.expectedWorkingCopyId,
  )
  const revisionNumber = revisionNumberSchema.safeParse(
    request.expectedRevisionNumber,
  )

  if (
    !applicationId.success ||
    !workingCopyId.success ||
    !revisionNumber.success
  ) {
    return null
  }

  return {
    ...request,
    applicationId: applicationId.data,
    expectedRevisionNumber: revisionNumber.data,
    expectedWorkingCopyId: workingCopyId.data,
  }
}

export function useApplicationWorkingCopyActions(
  dependencies: ApplicationWorkingCopyActionsDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationWorkingCopyActionState>({
    status: 'idle',
  })
  let pendingRequest: Promise<boolean> | null = null
  let lastRequest: ActionRequest | null = null

  const isBusy = computed(() => state.value.status === 'submitting')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable === true &&
      lastRequest !== null,
  )

  const submit = async (request: ActionRequest): Promise<boolean> => {
    const validRequest = validateActionRequest(request)

    if (!validRequest) {
      state.value = {
        action: request.action,
        applicationId: request.applicationId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }
      return false
    }

    lastRequest = validRequest
    state.value = {
      action: validRequest.action,
      applicationId: validRequest.applicationId,
      status: 'submitting',
    }

    let response: unknown

    try {
      if (validRequest.action === 'accept') {
        response = await dependencies.requestAccept(validRequest.applicationId)
      } else if (validRequest.action === 'discard') {
        response = await dependencies.requestDiscard(validRequest.applicationId)
      } else {
        response = await dependencies.requestRevision(
          validRequest.applicationId,
          validRequest.revision ?? { guidance: undefined },
        )
      }
    } catch (error) {
      const endpointFailure = getEndpointFailure(error)
      state.value = {
        action: validRequest.action,
        applicationId: validRequest.applicationId,
        failure: endpointFailure
          ? createEndpointFailure(endpointFailure)
          : createUnconfirmedFailure(),
        status: 'failure',
      }
      return false
    }

    if (validRequest.action === 'discard') {
      const result = discardWorkingCopyResponseSchema.safeParse(response)

      if (
        result.success &&
        result.data.discardedWorkingCopyId ===
          validRequest.expectedWorkingCopyId
      ) {
        state.value = {
          action: validRequest.action,
          applicationId: validRequest.applicationId,
          status: 'success',
        }
        return true
      }
    } else {
      const result = workingCopyLifecycleResponseSchema.safeParse(response)

      if (!result.success) {
        state.value = {
          action: validRequest.action,
          applicationId: validRequest.applicationId,
          failure: createUnconfirmedFailure(),
          status: 'failure',
        }
        return false
      }

      const workingCopy = result.data.workingCopy
      const expectedState =
        validRequest.action === 'accept' ? 'accepted' : 'awaiting_review'
      const revisionIsExpected =
        validRequest.action === 'revision'
          ? workingCopy?.revisionNumber !== undefined &&
            workingCopy.revisionNumber > validRequest.expectedRevisionNumber
          : workingCopy?.revisionNumber === validRequest.expectedRevisionNumber

      if (
        workingCopy.id === validRequest.expectedWorkingCopyId &&
        workingCopy.state === expectedState &&
        revisionIsExpected
      ) {
        state.value = {
          action: validRequest.action,
          applicationId: validRequest.applicationId,
          status: 'success',
        }
        return true
      }
    }

    state.value = {
      action: validRequest.action,
      applicationId: validRequest.applicationId,
      failure: createUnconfirmedFailure(),
      status: 'failure',
    }
    return false
  }

  const run = (request: ActionRequest): Promise<boolean> => {
    if (pendingRequest) {
      return pendingRequest
    }

    pendingRequest = submit(request).finally(() => {
      pendingRequest = null
    })

    return pendingRequest
  }

  const accept = (
    applicationId: string,
    workingCopyId: string,
    revisionNumber: number,
  ): Promise<boolean> =>
    run({
      action: 'accept',
      applicationId,
      expectedRevisionNumber: revisionNumber,
      expectedWorkingCopyId: workingCopyId,
    })

  const discard = (
    applicationId: string,
    workingCopyId: string,
    revisionNumber: number,
  ): Promise<boolean> =>
    run({
      action: 'discard',
      applicationId,
      expectedRevisionNumber: revisionNumber,
      expectedWorkingCopyId: workingCopyId,
    })

  const revise = (
    applicationId: string,
    workingCopyId: string,
    revisionNumber: number,
    input: unknown,
  ): Promise<boolean> => {
    const revision = requestWorkingCopyRevisionSchema.safeParse(input)

    if (!revision.success) {
      state.value = {
        action: 'revision',
        applicationId,
        failure: {
          code: 'invalid-revision-request',
          message:
            'Your revision request is too long. Shorten it and try again.',
          recovery: 'refresh-application',
          retryable: false,
        },
        status: 'failure',
      }
      return Promise.resolve(false)
    }

    return run({
      action: 'revision',
      applicationId,
      expectedRevisionNumber: revisionNumber,
      expectedWorkingCopyId: workingCopyId,
      revision: revision.data,
    })
  }

  const retry = (): Promise<boolean> =>
    lastRequest && canRetry.value ? run(lastRequest) : Promise.resolve(false)

  const reset = (): void => {
    if (isBusy.value) {
      return
    }

    lastRequest = null
    state.value = { status: 'idle' }
  }

  return {
    accept,
    canRetry,
    discard,
    isBusy,
    reset,
    retry,
    revise,
    state: readonly(state),
  }
}
