import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useBaseResumePreview,
  type BaseResumePreviewDependencies,
} from '../../app/composables/useBaseResumePreview'
import type { BaseResumePreviewResponse } from '../../shared/base-resumes/preview'

const baseResumeId = 'aab0beaa-b348-4670-93c8-a27d6bdf7e69'
const otherBaseResumeId = '30f11597-ad03-4ccc-81f1-858c3e6d6bdb'
const previewResponse: BaseResumePreviewResponse = {
  preview: {
    baseResumeId,
    expiresAt: '2026-08-22T06:05:00+00:00',
    originalFilename: 'Frontend Engineering.pdf',
    url: 'http://127.0.0.1:54321/storage/v1/object/sign/base-resumes/signed-token',
  },
}

const createDependencies = (
  requestPreview: BaseResumePreviewDependencies['requestPreview'],
): BaseResumePreviewDependencies => ({ requestPreview })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base resume preview composable', () => {
  it('uses the authenticated preview endpoint without transport retries', async () => {
    const request = vi.fn().mockResolvedValue(previewResponse)
    vi.stubGlobal('$fetch', request)
    const preview = useBaseResumePreview()

    await expect(preview.load(baseResumeId)).resolves.toEqual(
      previewResponse.preview,
    )

    expect(request).toHaveBeenCalledWith(
      `/api/base-resumes/${baseResumeId}/preview`,
      { method: 'GET', retry: false },
    )
  })

  it('makes at most one request while a preview attempt is unresolved', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestPreview = vi.fn(
      (_baseResumeId: string) =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const preview = useBaseResumePreview(createDependencies(requestPreview))

    const firstAttempt = preview.load(baseResumeId)
    const duplicateAttempt = preview.load(otherBaseResumeId)

    expect(firstAttempt).toBe(duplicateAttempt)
    expect(requestPreview).toHaveBeenCalledOnce()
    expect(requestPreview).toHaveBeenCalledWith(baseResumeId)
    expect(preview.state.value).toEqual({
      baseResumeId,
      status: 'loading',
    })
    expect(preview.isLoading.value).toBe(true)

    resolveRequest?.(previewResponse)

    await expect(firstAttempt).resolves.toEqual(previewResponse.preview)
    expect(preview.state.value).toEqual({
      preview: previewResponse.preview,
      status: 'ready',
    })
  })

  it('rejects an invalid identifier before making a request', async () => {
    const requestPreview = vi.fn()
    const preview = useBaseResumePreview(createDependencies(requestPreview))

    await expect(preview.load('not-a-uuid')).resolves.toBeNull()

    expect(requestPreview).not.toHaveBeenCalled()
    expect(preview.state.value).toMatchObject({
      baseResumeId: 'not-a-uuid',
      failure: {
        code: 'invalid-base-resume-id',
        recovery: 'refresh',
        retryable: false,
      },
      status: 'failure',
    })
  })

  it.each([
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
      code: 'base-resume-unavailable',
      recovery: 'refresh',
      retryable: false,
      statusCode: 404,
    },
    {
      code: 'invalid-base-resume-id',
      recovery: 'refresh',
      retryable: false,
      statusCode: 400,
    },
    {
      code: 'base-resume-preview-unavailable',
      recovery: 'retry',
      retryable: true,
      statusCode: 503,
    },
  ] as const)(
    'maps $code to sanitized client recovery behavior',
    async ({ code, recovery, retryable, statusCode }) => {
      const requestPreview = vi.fn().mockRejectedValue({
        data: {
          data: { code },
          providerMessage: 'private provider detail',
        },
        statusCode,
      })
      const preview = useBaseResumePreview(createDependencies(requestPreview))

      await preview.load(baseResumeId)

      expect(preview.state.value).toMatchObject({
        baseResumeId,
        failure: { code, recovery, retryable },
        status: 'failure',
      })
      expect(JSON.stringify(preview.state.value)).not.toContain(
        'private provider detail',
      )
    },
  )

  it.each([
    new Error('connection dropped'),
    {
      data: { data: { code: 'base-resume-preview-unavailable' } },
      statusCode: 500,
    },
  ])(
    'requires reconciliation when a preview result is not safely confirmed',
    async (failure) => {
      const requestPreview = vi.fn().mockRejectedValue(failure)
      const preview = useBaseResumePreview(createDependencies(requestPreview))

      await expect(preview.load(baseResumeId)).resolves.toBeNull()

      expect(preview.state.value).toMatchObject({
        failure: {
          code: 'unknown',
          recovery: 'refresh',
          retryable: false,
        },
        status: 'failure',
      })
      expect(preview.canRetry.value).toBe(false)

      await expect(preview.retry()).resolves.toBeNull()
      expect(requestPreview).toHaveBeenCalledOnce()
    },
  )

  it('retries the same resume only after a retry-safe failure', async () => {
    const requestPreview = vi
      .fn()
      .mockRejectedValueOnce({
        data: { data: { code: 'authentication-unavailable' } },
        statusCode: 503,
      })
      .mockResolvedValueOnce(previewResponse)
    const preview = useBaseResumePreview(createDependencies(requestPreview))

    await expect(preview.load(baseResumeId)).resolves.toBeNull()
    expect(preview.canRetry.value).toBe(true)

    await expect(preview.retry()).resolves.toEqual(previewResponse.preview)
    expect(requestPreview).toHaveBeenNthCalledWith(2, baseResumeId)
    expect(preview.state.value.status).toBe('ready')
  })

  it.each([
    {
      response: {
        preview: {
          ...previewResponse.preview,
          providerDetails: 'must not cross the boundary',
        },
      },
      title: 'malformed success data',
    },
    {
      response: {
        preview: {
          ...previewResponse.preview,
          baseResumeId: otherBaseResumeId,
        },
      },
      title: 'a response for another resume',
    },
  ])('rejects $title', async ({ response }) => {
    const preview = useBaseResumePreview(
      createDependencies(vi.fn().mockResolvedValue(response)),
    )

    await expect(preview.load(baseResumeId)).resolves.toBeNull()

    expect(preview.state.value).toMatchObject({
      baseResumeId,
      failure: {
        code: 'unknown',
        recovery: 'refresh',
        retryable: false,
      },
      status: 'failure',
    })
  })

  it('ignores a stale response after dismissal and allows a new preview', async () => {
    let resolveFirstRequest: ((value: unknown) => void) | undefined
    const secondResponse: BaseResumePreviewResponse = {
      preview: {
        ...previewResponse.preview,
        baseResumeId: otherBaseResumeId,
        originalFilename: 'Product Resume.pdf',
      },
    }
    const requestPreview = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<unknown>((resolve) => {
            resolveFirstRequest = resolve
          }),
      )
      .mockResolvedValueOnce(secondResponse)
    const preview = useBaseResumePreview(createDependencies(requestPreview))

    const staleAttempt = preview.load(baseResumeId)
    preview.reset()
    expect(preview.state.value).toEqual({ status: 'idle' })

    await expect(preview.load(otherBaseResumeId)).resolves.toEqual(
      secondResponse.preview,
    )
    resolveFirstRequest?.(previewResponse)
    await expect(staleAttempt).resolves.toBeNull()

    expect(requestPreview).toHaveBeenCalledTimes(2)
    expect(preview.state.value).toEqual({
      preview: secondResponse.preview,
      status: 'ready',
    })
  })
})
