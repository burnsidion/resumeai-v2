import { applicationIdSchema } from '~~/shared/applications/constraints'
import { deleteApplicationResponseSchema } from '~~/shared/applications/deletion'
import {
  applicationManagementEndpointErrorCodeSchema,
  type ApplicationManagementEndpointErrorCode,
} from '~~/shared/applications/errors'

export type ApplicationDeletionRecovery =
  'back-to-applications' | 'refresh-application' | 'retry' | 'sign-in'

export interface ApplicationDeletionFailure {
  code: ApplicationManagementEndpointErrorCode | 'unknown'
  message: string
  recovery: ApplicationDeletionRecovery
  retryable: boolean
}

export type ApplicationDeletionState =
  | { status: 'idle' }
  | { applicationId: string; status: 'deleting' }
  | { applicationId: string; status: 'success' }
  | {
      applicationId: string
      failure: ApplicationDeletionFailure
      status: 'failure'
    }

export interface ApplicationDeletionDependencies {
  requestDeletion(applicationId: string): Promise<unknown>
}

interface EndpointFailure {
  code: ApplicationManagementEndpointErrorCode
  statusCode: number | null
}

const defaultDependencies: ApplicationDeletionDependencies = {
  requestDeletion: (applicationId) =>
    $fetch(`/api/applications/${applicationId}`, {
      method: 'DELETE',
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

const createUnconfirmedFailure = (): ApplicationDeletionFailure => ({
  code: 'unknown',
  message:
    "We couldn't confirm whether this application was deleted. Refresh it before trying again.",
  recovery: 'refresh-application',
  retryable: false,
})

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): ApplicationDeletionFailure => {
  switch (code) {
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to delete this application.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message:
          "We couldn't verify your session. Try deleting the application again.",
        recovery: 'retry',
        retryable: true,
      }
    case 'application-unavailable':
      return {
        code,
        message:
          'This application is no longer available. Return to your applications to see the latest saved list.',
        recovery: 'back-to-applications',
        retryable: false,
      }
    case 'invalid-application-id':
      return {
        code,
        message:
          'This application could not be identified safely. Return to your applications and try again.',
        recovery: 'back-to-applications',
        retryable: false,
      }
    case 'application-deletion-unavailable':
      if (statusCode === 503) {
        return {
          code,
          message:
            'Application deletion is temporarily unavailable. Try again.',
          recovery: 'retry',
          retryable: true,
        }
      }

      return createUnconfirmedFailure()
    case 'application-save-unavailable':
    case 'application-update-conflict':
    case 'applications-unavailable':
    case 'invalid-application':
    case 'selected-base-resume-unavailable':
      return createUnconfirmedFailure()
    default:
      return createUnconfirmedFailure()
  }
}

export function useApplicationDeletion(
  dependencies: ApplicationDeletionDependencies = defaultDependencies,
) {
  const state = shallowRef<ApplicationDeletionState>({ status: 'idle' })
  let pendingDeletion: Promise<string | null> | null = null

  const isBusy = computed(() => state.value.status === 'deleting')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable === true,
  )

  const completeDeletion = async (
    applicationId: string,
  ): Promise<string | null> => {
    state.value = { applicationId, status: 'deleting' }

    let response: unknown

    try {
      response = await dependencies.requestDeletion(applicationId)
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

    const result = deleteApplicationResponseSchema.safeParse(response)

    if (!result.success || result.data.application.id !== applicationId) {
      state.value = {
        applicationId,
        failure: createUnconfirmedFailure(),
        status: 'failure',
      }

      return null
    }

    state.value = { applicationId, status: 'success' }

    return applicationId
  }

  const remove = (applicationId: string): Promise<string | null> => {
    if (pendingDeletion) {
      return pendingDeletion
    }

    const parsedId = applicationIdSchema.safeParse(applicationId)

    if (!parsedId.success) {
      state.value = {
        applicationId,
        failure: createEndpointFailure({
          code: 'invalid-application-id',
          statusCode: null,
        }),
        status: 'failure',
      }

      return Promise.resolve(null)
    }

    pendingDeletion = completeDeletion(parsedId.data).finally(() => {
      pendingDeletion = null
    })

    return pendingDeletion
  }

  const retry = (): Promise<string | null> => {
    const currentState = state.value

    if (
      currentState.status !== 'failure' ||
      currentState.failure.retryable !== true
    ) {
      return Promise.resolve(null)
    }

    return remove(currentState.applicationId)
  }

  const reset = (): void => {
    if (state.value.status === 'deleting') {
      return
    }

    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    isBusy,
    remove,
    reset,
    retry,
    state: readonly(state),
  }
}
