import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useApplicationDeletion,
  type ApplicationDeletionDependencies,
} from '../../app/composables/useApplicationDeletion'
import type { DeleteApplicationResponse } from '../../shared/applications/deletion'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const otherApplicationId = 'b52a98d0-2a76-4843-b581-460dd5ece775'
const response: DeleteApplicationResponse = {
  application: { id: applicationId },
}

const createDependencies = (
  requestDeletion: ApplicationDeletionDependencies['requestDeletion'],
): ApplicationDeletionDependencies => ({ requestDeletion })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('application deletion composable', () => {
  it('uses the authenticated deletion endpoint without transport retries', async () => {
    const request = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('$fetch', request)
    const deletion = useApplicationDeletion()

    await expect(deletion.remove(applicationId)).resolves.toBe(applicationId)

    expect(request).toHaveBeenCalledWith(`/api/applications/${applicationId}`, {
      method: 'DELETE',
      retry: false,
    })
  })

  it('submits one deletion request and accepts only the matching safe response', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestDeletion = vi.fn(
      (_applicationId: string) =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const deletion = useApplicationDeletion(createDependencies(requestDeletion))

    const firstAttempt = deletion.remove(applicationId)
    const duplicateAttempt = deletion.remove(otherApplicationId)

    expect(firstAttempt).toBe(duplicateAttempt)
    expect(requestDeletion).toHaveBeenCalledOnce()
    expect(requestDeletion).toHaveBeenCalledWith(applicationId)
    expect(deletion.state.value).toEqual({ applicationId, status: 'deleting' })

    resolveRequest?.(response)

    await expect(firstAttempt).resolves.toBe(applicationId)
    expect(deletion.state.value).toEqual({ applicationId, status: 'success' })
  })

  it('rejects an invalid identifier before making a request', async () => {
    const requestDeletion = vi.fn()
    const deletion = useApplicationDeletion(createDependencies(requestDeletion))

    await expect(deletion.remove('not-a-uuid')).resolves.toBeNull()

    expect(requestDeletion).not.toHaveBeenCalled()
    expect(deletion.state.value).toMatchObject({
      applicationId: 'not-a-uuid',
      failure: {
        code: 'invalid-application-id',
        recovery: 'back-to-applications',
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
      code: 'application-unavailable',
      recovery: 'back-to-applications',
      retryable: false,
      statusCode: 404,
    },
    {
      code: 'application-deletion-unavailable',
      recovery: 'retry',
      retryable: true,
      statusCode: 503,
    },
  ] as const)(
    'maps $code to sanitized client recovery behavior',
    async ({ code, recovery, retryable, statusCode }) => {
      const requestDeletion = vi.fn().mockRejectedValue({
        data: {
          data: { code },
          providerMessage: 'private provider detail',
        },
        statusCode,
      })
      const deletion = useApplicationDeletion(
        createDependencies(requestDeletion),
      )

      await deletion.remove(applicationId)

      expect(deletion.state.value).toMatchObject({
        applicationId,
        failure: { code, recovery, retryable },
        status: 'failure',
      })
      expect(JSON.stringify(deletion.state.value)).not.toContain(
        'private provider detail',
      )
    },
  )

  it('does not retry an uncertain deletion result', async () => {
    const requestDeletion = vi
      .fn()
      .mockRejectedValue(new Error('connection lost'))
    const deletion = useApplicationDeletion(createDependencies(requestDeletion))

    await expect(deletion.remove(applicationId)).resolves.toBeNull()

    expect(deletion.state.value).toMatchObject({
      failure: {
        recovery: 'refresh-application',
        retryable: false,
      },
      status: 'failure',
    })
    await expect(deletion.retry()).resolves.toBeNull()
    expect(requestDeletion).toHaveBeenCalledOnce()
  })

  it('retries the same application only after a retry-safe failure', async () => {
    const requestDeletion = vi
      .fn()
      .mockRejectedValueOnce({
        data: { data: { code: 'authentication-unavailable' } },
        statusCode: 503,
      })
      .mockResolvedValueOnce(response)
    const deletion = useApplicationDeletion(createDependencies(requestDeletion))

    await expect(deletion.remove(applicationId)).resolves.toBeNull()
    expect(deletion.canRetry.value).toBe(true)

    await expect(deletion.retry()).resolves.toBe(applicationId)
    expect(requestDeletion).toHaveBeenNthCalledWith(2, applicationId)
  })

  it.each([
    { application: { id: applicationId, providerDetails: 'hidden' } },
    { application: { id: otherApplicationId } },
  ])(
    'rejects malformed or mismatched success data',
    async (invalidResponse) => {
      const deletion = useApplicationDeletion(
        createDependencies(vi.fn().mockResolvedValue(invalidResponse)),
      )

      await expect(deletion.remove(applicationId)).resolves.toBeNull()

      expect(deletion.state.value).toMatchObject({
        failure: { code: 'unknown', recovery: 'refresh-application' },
        status: 'failure',
      })
    },
  )
})
