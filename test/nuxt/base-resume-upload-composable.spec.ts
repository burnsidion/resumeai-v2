import { describe, expect, it, vi } from 'vitest'

import {
  useBaseResumeUpload,
  type BaseResumeUploadDependencies,
} from '../../app/composables/useBaseResumeUpload'
import { validateBaseResumeSelection } from '../../app/utils/base-resumes/validate-selection'
import type { UploadBaseResumeResponse } from '../../shared/base-resumes/upload'

const uploadedResume: UploadBaseResumeResponse = {
  baseResume: {
    activeSlot: 1,
    createdAt: '2026-08-08T05:00:00+00:00',
    id: 'aab0beaa-b348-4670-93c8-a27d6bdf7e69',
    originalFilename: 'Resume.pdf',
  },
}

const createPdf = (): File =>
  new File(['%PDF-1.7\n%%EOF'], 'Resume.pdf', {
    type: 'application/pdf',
  })

const createDependencies = (
  requestUpload: BaseResumeUploadDependencies['requestUpload'],
): BaseResumeUploadDependencies => ({
  requestUpload,
  validateSelection: validateBaseResumeSelection,
})

describe('base resume upload composable', () => {
  it('validates a selection before exposing it for explicit submission', async () => {
    const requestUpload = vi.fn()
    const upload = useBaseResumeUpload(createDependencies(requestUpload))
    const file = createPdf()

    const selecting = upload.selectFile(file)

    expect(upload.state.value).toEqual({ file, status: 'validating' })
    await selecting
    expect(upload.state.value).toMatchObject({
      selection: { file, normalizedFilename: 'Resume.pdf' },
      status: 'ready',
    })
    expect(upload.canSubmit.value).toBe(true)
    expect(requestUpload).not.toHaveBeenCalled()
  })

  it('submits one multipart request and validates the safe response', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestUpload = vi.fn(
      (_body: FormData) =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const upload = useBaseResumeUpload(createDependencies(requestUpload))
    const file = createPdf()

    await upload.selectFile(file)
    const firstAttempt = upload.uploadSelected()
    const duplicateAttempt = upload.uploadSelected()

    expect(firstAttempt).toBe(duplicateAttempt)
    expect(requestUpload).toHaveBeenCalledOnce()
    expect(upload.state.value.status).toBe('uploading')

    const body = requestUpload.mock.calls[0]?.[0]
    expect(body).toBeInstanceOf(FormData)
    expect(body?.get('file')).toBe(file)

    resolveRequest?.(uploadedResume)

    await expect(firstAttempt).resolves.toEqual(uploadedResume.baseResume)
    expect(upload.state.value).toEqual({
      baseResume: uploadedResume.baseResume,
      status: 'success',
    })
  })

  it('does not submit a selection that fails client validation', async () => {
    const requestUpload = vi.fn()
    const upload = useBaseResumeUpload(createDependencies(requestUpload))

    await upload.selectFile(
      new File(['not a PDF'], 'Resume.pdf', { type: 'application/pdf' }),
    )

    expect(upload.state.value).toMatchObject({
      failure: {
        code: 'invalid-pdf',
        recovery: 'choose-another-file',
        retryable: false,
      },
      selection: null,
      status: 'failure',
    })
    expect(upload.canSubmit.value).toBe(false)
    await expect(upload.uploadSelected()).resolves.toBeNull()
    expect(requestUpload).not.toHaveBeenCalled()
  })

  it('recovers safely when local validation cannot complete', async () => {
    const requestUpload = vi.fn()
    const upload = useBaseResumeUpload({
      requestUpload,
      validateSelection: vi
        .fn()
        .mockRejectedValue(new Error('private browser detail')),
    })

    await expect(upload.selectFile(createPdf())).resolves.toBeUndefined()

    expect(upload.state.value).toMatchObject({
      failure: {
        code: 'invalid-upload',
        recovery: 'choose-another-file',
        retryable: false,
      },
      selection: null,
      status: 'failure',
    })
    expect(requestUpload).not.toHaveBeenCalled()
  })

  it('allows an explicit retry only after a confirmed retry-safe response', async () => {
    const requestUpload = vi
      .fn()
      .mockRejectedValueOnce({
        data: { data: { code: 'base-resume-upload-unavailable' } },
        statusCode: 503,
      })
      .mockResolvedValueOnce(uploadedResume)
    const upload = useBaseResumeUpload(createDependencies(requestUpload))

    await upload.selectFile(createPdf())
    await expect(upload.uploadSelected()).resolves.toBeNull()

    expect(upload.state.value).toMatchObject({
      failure: {
        code: 'base-resume-upload-unavailable',
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    })
    expect(upload.canRetry.value).toBe(true)

    await expect(upload.uploadSelected()).resolves.toEqual(
      uploadedResume.baseResume,
    )
    expect(requestUpload).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      code: 'active-resume-limit-reached',
      recovery: 'refresh',
      retryable: false,
      statusCode: 409,
    },
    {
      code: 'authentication-required',
      recovery: 'sign-in',
      retryable: false,
      statusCode: 401,
    },
    {
      code: 'authentication-unavailable',
      recovery: 'retry',
      retryable: true,
      statusCode: 503,
    },
    {
      code: 'unsupported-file-type',
      recovery: 'choose-another-file',
      retryable: false,
      statusCode: 415,
    },
  ] as const)(
    'maps $code to sanitized client recovery behavior',
    async ({ code, recovery, retryable, statusCode }) => {
      const requestUpload = vi.fn().mockRejectedValue({
        data: {
          data: { code },
          providerMessage: 'private provider detail',
        },
        statusCode,
      })
      const upload = useBaseResumeUpload(createDependencies(requestUpload))

      await upload.selectFile(createPdf())
      await upload.uploadSelected()

      expect(upload.state.value).toMatchObject({
        failure: { code, recovery, retryable },
        status: 'failure',
      })
      expect(JSON.stringify(upload.state.value)).not.toContain(
        'private provider detail',
      )
    },
  )

  it.each([
    new Error('connection dropped after submission'),
    {
      data: { data: { code: 'base-resume-upload-unavailable' } },
      statusCode: 500,
    },
  ])('does not blindly retry an unconfirmed upload result', async (failure) => {
    const requestUpload = vi.fn().mockRejectedValue(failure)
    const upload = useBaseResumeUpload(createDependencies(requestUpload))

    await upload.selectFile(createPdf())
    await expect(upload.uploadSelected()).resolves.toBeNull()

    expect(upload.state.value).toMatchObject({
      failure: {
        recovery: 'refresh',
        retryable: false,
      },
      status: 'failure',
    })
    expect(upload.canRetry.value).toBe(false)

    await expect(upload.uploadSelected()).resolves.toBeNull()
    expect(requestUpload).toHaveBeenCalledOnce()
  })

  it('rejects malformed success data instead of trusting the transport', async () => {
    const requestUpload = vi.fn().mockResolvedValue({
      baseResume: {
        ...uploadedResume.baseResume,
        providerDetails: 'must not cross the boundary',
      },
    })
    const upload = useBaseResumeUpload(createDependencies(requestUpload))

    await upload.selectFile(createPdf())
    await expect(upload.uploadSelected()).resolves.toBeNull()

    expect(upload.state.value).toMatchObject({
      failure: {
        code: 'unknown',
        recovery: 'refresh',
        retryable: false,
      },
      status: 'failure',
    })
  })
})
