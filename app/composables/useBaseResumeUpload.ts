import { MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES } from '~~/shared/base-resumes/constraints'
import {
  baseResumeUploadEndpointErrorCodeSchema,
  uploadBaseResumeResponseSchema,
  type BaseResumeUploadEndpointErrorCode,
  type UploadedBaseResume,
} from '~~/shared/base-resumes/upload'
import {
  validateBaseResumeSelection,
  type BaseResumeSelectionValidationResult,
  type ValidBaseResumeSelection,
} from '~/utils/base-resumes/validate-selection'

export type BaseResumeUploadRecovery =
  'choose-another-file' | 'refresh' | 'retry' | 'sign-in'

export interface BaseResumeUploadFailure {
  code: BaseResumeUploadEndpointErrorCode | 'unknown'
  message: string
  recovery: BaseResumeUploadRecovery
  retryable: boolean
}

export type BaseResumeUploadState =
  | { status: 'idle' }
  | { file: File; status: 'validating' }
  | { selection: ValidBaseResumeSelection; status: 'ready' }
  | { selection: ValidBaseResumeSelection; status: 'uploading' }
  | { baseResume: UploadedBaseResume; status: 'success' }
  | {
      failure: BaseResumeUploadFailure
      selection: ValidBaseResumeSelection | null
      status: 'failure'
    }

export interface BaseResumeUploadDependencies {
  requestUpload(body: FormData): Promise<unknown>
  validateSelection(file: File): Promise<BaseResumeSelectionValidationResult>
}

interface EndpointFailure {
  code: BaseResumeUploadEndpointErrorCode
  statusCode: number | null
}

const defaultDependencies: BaseResumeUploadDependencies = {
  requestUpload: (body) =>
    $fetch('/api/base-resumes', {
      body,
      method: 'POST',
      retry: false,
    }),
  validateSelection: validateBaseResumeSelection,
}

const selectionFailureMessages = {
  'file-too-large': `Choose a PDF no larger than ${MAXIMUM_BASE_RESUME_SIZE_MEBIBYTES} MiB.`,
  'invalid-filename': 'Choose a PDF with a supported filename.',
  'invalid-pdf': 'This file does not appear to be a valid PDF.',
  'invalid-upload':
    'This PDF could not be read. Choose it again or try another file.',
  'unsupported-file-type': 'Only PDF files are supported.',
} as const satisfies Partial<Record<BaseResumeUploadEndpointErrorCode, string>>

const createSelectionFailure = (
  code: keyof typeof selectionFailureMessages,
): BaseResumeUploadFailure => ({
  code,
  message: selectionFailureMessages[code],
  recovery: 'choose-another-file',
  retryable: false,
})

const getEndpointFailure = (error: unknown): EndpointFailure | null => {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const response = error as {
    data?: { data?: { code?: unknown } }
    status?: unknown
    statusCode?: unknown
  }
  const code = baseResumeUploadEndpointErrorCodeSchema.safeParse(
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

const createUnconfirmedFailure = (): BaseResumeUploadFailure => ({
  code: 'unknown',
  message:
    "We couldn't confirm whether the upload completed. Refresh your resumes before trying again.",
  recovery: 'refresh',
  retryable: false,
})

const createEndpointFailure = ({
  code,
  statusCode,
}: EndpointFailure): BaseResumeUploadFailure => {
  if (code in selectionFailureMessages) {
    return createSelectionFailure(code as keyof typeof selectionFailureMessages)
  }

  switch (code) {
    case 'active-resume-limit-reached':
      return {
        code,
        message:
          'You already have three active base resumes. No additional resume was uploaded.',
        recovery: 'refresh',
        retryable: false,
      }
    case 'authentication-required':
      return {
        code,
        message:
          'Your session is no longer available. Sign in again to upload.',
        recovery: 'sign-in',
        retryable: false,
      }
    case 'authentication-unavailable':
      return {
        code,
        message: "We couldn't verify your session. Try the upload again.",
        recovery: 'retry',
        retryable: true,
      }
    case 'base-resume-upload-unavailable':
      if (statusCode === 503) {
        return {
          code,
          message: 'Resume upload is temporarily unavailable. Try again.',
          recovery: 'retry',
          retryable: true,
        }
      }

      return {
        code,
        message:
          "We couldn't confirm a safe upload result. Refresh your resumes before trying again.",
        recovery: 'refresh',
        retryable: false,
      }
  }

  return createUnconfirmedFailure()
}

export function useBaseResumeUpload(
  dependencies: BaseResumeUploadDependencies = defaultDependencies,
) {
  const state = shallowRef<BaseResumeUploadState>({ status: 'idle' })
  let validationAttempt = 0
  let pendingUpload: Promise<UploadedBaseResume | null> | null = null

  const isBusy = computed(
    () =>
      state.value.status === 'validating' || state.value.status === 'uploading',
  )
  const canSubmit = computed(() => state.value.status === 'ready')
  const canRetry = computed(
    () =>
      state.value.status === 'failure' &&
      state.value.failure.retryable &&
      state.value.selection !== null,
  )

  const selectFile = async (file: File): Promise<void> => {
    if (state.value.status === 'uploading') {
      return
    }

    const attempt = ++validationAttempt
    state.value = { file, status: 'validating' }
    let result: BaseResumeSelectionValidationResult

    try {
      result = await dependencies.validateSelection(file)
    } catch {
      if (attempt === validationAttempt) {
        state.value = {
          failure: createSelectionFailure('invalid-upload'),
          selection: null,
          status: 'failure',
        }
      }

      return
    }

    if (attempt !== validationAttempt) {
      return
    }

    state.value = result.valid
      ? { selection: result.selection, status: 'ready' }
      : {
          failure: createSelectionFailure(result.code),
          selection: null,
          status: 'failure',
        }
  }

  const completeUpload = async (
    selection: ValidBaseResumeSelection,
  ): Promise<UploadedBaseResume | null> => {
    state.value = { selection, status: 'uploading' }

    const body = new FormData()
    body.append('file', selection.file)

    let response: unknown

    try {
      response = await dependencies.requestUpload(body)
    } catch (error) {
      const endpointFailure = getEndpointFailure(error)

      state.value = {
        failure: endpointFailure
          ? createEndpointFailure(endpointFailure)
          : createUnconfirmedFailure(),
        selection,
        status: 'failure',
      }

      return null
    }

    const result = uploadBaseResumeResponseSchema.safeParse(response)

    if (!result.success) {
      state.value = {
        failure: createUnconfirmedFailure(),
        selection,
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

  const uploadSelected = (): Promise<UploadedBaseResume | null> => {
    if (pendingUpload) {
      return pendingUpload
    }

    const currentState = state.value
    const selection =
      currentState.status === 'ready' ||
      (currentState.status === 'failure' && currentState.failure.retryable)
        ? currentState.selection
        : null

    if (!selection) {
      return Promise.resolve(null)
    }

    pendingUpload = completeUpload(selection).finally(() => {
      pendingUpload = null
    })

    return pendingUpload
  }

  const reset = (): void => {
    if (state.value.status === 'uploading') {
      return
    }

    validationAttempt += 1
    state.value = { status: 'idle' }
  }

  return {
    canRetry,
    canSubmit,
    isBusy,
    reset,
    selectFile,
    state: readonly(state),
    uploadSelected,
  }
}
