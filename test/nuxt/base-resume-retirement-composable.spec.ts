import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useBaseResumeRetirement,
  type BaseResumeRetirementDependencies,
} from '../../app/composables/useBaseResumeRetirement'
import type { RetireBaseResumeResponse } from '../../shared/base-resumes/retirement'

const baseResumeId = 'aab0beaa-b348-4670-93c8-a27d6bdf7e69'
const otherBaseResumeId = '30f11597-ad03-4ccc-81f1-858c3e6d6bdb'
const retiredResume: RetireBaseResumeResponse = {
  baseResume: {
    id: baseResumeId,
    retiredAt: '2026-08-19T20:00:00+00:00',
  },
}

const createDependencies = (
  requestRetirement: BaseResumeRetirementDependencies['requestRetirement'],
): BaseResumeRetirementDependencies => ({ requestRetirement })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base resume retirement composable', () => {
  it('uses the authenticated retirement endpoint without transport retries', async () => {
    const request = vi.fn().mockResolvedValue(retiredResume)
    vi.stubGlobal('$fetch', request)
    const retirement = useBaseResumeRetirement()

    await expect(retirement.retire(baseResumeId)).resolves.toEqual(
      retiredResume.baseResume,
    )

    expect(request).toHaveBeenCalledWith(
      `/api/base-resumes/${baseResumeId}/retire`,
      { method: 'POST', retry: false },
    )
  })

  it('submits one retirement request and validates the safe response', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestRetirement = vi.fn(
      (_baseResumeId: string) =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const retirement = useBaseResumeRetirement(
      createDependencies(requestRetirement),
    )

    const firstAttempt = retirement.retire(baseResumeId)
    const duplicateAttempt = retirement.retire(otherBaseResumeId)

    expect(firstAttempt).toBe(duplicateAttempt)
    expect(requestRetirement).toHaveBeenCalledOnce()
    expect(requestRetirement).toHaveBeenCalledWith(baseResumeId)
    expect(retirement.state.value).toEqual({
      baseResumeId,
      status: 'retiring',
    })
    expect(retirement.isBusy.value).toBe(true)

    retirement.reset()
    expect(retirement.state.value.status).toBe('retiring')

    resolveRequest?.(retiredResume)

    await expect(firstAttempt).resolves.toEqual(retiredResume.baseResume)
    expect(retirement.state.value).toEqual({
      baseResume: retiredResume.baseResume,
      status: 'success',
    })
    expect(retirement.isBusy.value).toBe(false)
  })

  it('rejects an invalid identifier before making a request', async () => {
    const requestRetirement = vi.fn()
    const retirement = useBaseResumeRetirement(
      createDependencies(requestRetirement),
    )

    await expect(retirement.retire('not-a-uuid')).resolves.toBeNull()

    expect(requestRetirement).not.toHaveBeenCalled()
    expect(retirement.state.value).toMatchObject({
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
      code: 'base-resume-retirement-unavailable',
      recovery: 'retry',
      retryable: true,
      statusCode: 503,
    },
  ] as const)(
    'maps $code to sanitized client recovery behavior',
    async ({ code, recovery, retryable, statusCode }) => {
      const requestRetirement = vi.fn().mockRejectedValue({
        data: {
          data: { code },
          providerMessage: 'private provider detail',
        },
        statusCode,
      })
      const retirement = useBaseResumeRetirement(
        createDependencies(requestRetirement),
      )

      await retirement.retire(baseResumeId)

      expect(retirement.state.value).toMatchObject({
        baseResumeId,
        failure: { code, recovery, retryable },
        status: 'failure',
      })
      expect(JSON.stringify(retirement.state.value)).not.toContain(
        'private provider detail',
      )
    },
  )

  it.each([
    new Error('connection dropped after submission'),
    {
      data: { data: { code: 'base-resume-retirement-unavailable' } },
      statusCode: 500,
    },
  ])(
    'does not blindly retry an unconfirmed retirement result',
    async (failure) => {
      const requestRetirement = vi.fn().mockRejectedValue(failure)
      const retirement = useBaseResumeRetirement(
        createDependencies(requestRetirement),
      )

      await expect(retirement.retire(baseResumeId)).resolves.toBeNull()

      expect(retirement.state.value).toMatchObject({
        failure: {
          recovery: 'refresh',
          retryable: false,
        },
        status: 'failure',
      })
      expect(retirement.canRetry.value).toBe(false)

      await expect(retirement.retry()).resolves.toBeNull()
      expect(requestRetirement).toHaveBeenCalledOnce()
    },
  )

  it('retries the same resume only after a retry-safe failure', async () => {
    const requestRetirement = vi
      .fn()
      .mockRejectedValueOnce({
        data: { data: { code: 'authentication-unavailable' } },
        statusCode: 503,
      })
      .mockResolvedValueOnce(retiredResume)
    const retirement = useBaseResumeRetirement(
      createDependencies(requestRetirement),
    )

    await expect(retirement.retire(baseResumeId)).resolves.toBeNull()
    expect(retirement.canRetry.value).toBe(true)

    await expect(retirement.retry()).resolves.toEqual(retiredResume.baseResume)
    expect(requestRetirement).toHaveBeenNthCalledWith(2, baseResumeId)
    expect(retirement.state.value.status).toBe('success')
  })

  it.each([
    {
      response: {
        baseResume: {
          ...retiredResume.baseResume,
          providerDetails: 'must not cross the boundary',
        },
      },
      title: 'malformed success data',
    },
    {
      response: {
        baseResume: {
          ...retiredResume.baseResume,
          id: otherBaseResumeId,
        },
      },
      title: 'a response for another resume',
    },
  ])('rejects $title', async ({ response }) => {
    const requestRetirement = vi.fn().mockResolvedValue(response)
    const retirement = useBaseResumeRetirement(
      createDependencies(requestRetirement),
    )

    await expect(retirement.retire(baseResumeId)).resolves.toBeNull()

    expect(retirement.state.value).toMatchObject({
      baseResumeId,
      failure: {
        code: 'unknown',
        recovery: 'refresh',
        retryable: false,
      },
      status: 'failure',
    })
  })

  it('returns to idle only after the current attempt has settled', async () => {
    const retirement = useBaseResumeRetirement(
      createDependencies(vi.fn().mockResolvedValue(retiredResume)),
    )

    await retirement.retire(baseResumeId)
    retirement.reset()

    expect(retirement.state.value).toEqual({ status: 'idle' })
  })
})
