import { describe, expect, it, vi } from 'vitest'

import {
  useApplicationTailoring,
  type ApplicationTailoringDependencies,
} from '../../app/composables/useApplicationTailoring'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const providerMessage = 'Sensitive provider implementation details'
const successResponse = {
  workingCopy: {
    id: workingCopyId,
    revisionNumber: 1,
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
}

const createDependencies = (
  requestTailoring: ApplicationTailoringDependencies['requestTailoring'],
): ApplicationTailoringDependencies => ({ requestTailoring })

const createEndpointError = (code: string, statusCode: number) => ({
  data: { data: { code } },
  message: providerMessage,
  statusCode,
})

describe('application tailoring composable', () => {
  it('starts one explicit request and shares its promise during repeat submission', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestTailoring = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const tailoring = useApplicationTailoring(
      createDependencies(requestTailoring),
    )

    const firstAttempt = tailoring.start(applicationId)
    const repeatedAttempt = tailoring.start(applicationId)

    expect(firstAttempt).toBe(repeatedAttempt)
    expect(tailoring.isBusy.value).toBe(true)
    expect(tailoring.state.value).toEqual({
      applicationId,
      status: 'generating',
    })
    expect(requestTailoring).toHaveBeenCalledOnce()
    expect(requestTailoring).toHaveBeenCalledWith(applicationId)

    resolveRequest?.(successResponse)

    await expect(firstAttempt).resolves.toEqual(successResponse)
    expect(tailoring.state.value).toEqual({
      applicationId,
      response: successResponse,
      status: 'success',
    })
  })

  it('rejects an invalid application ID before transport work', async () => {
    const requestTailoring = vi.fn()
    const tailoring = useApplicationTailoring(
      createDependencies(requestTailoring),
    )

    await expect(tailoring.start('not-an-id')).resolves.toBeNull()

    expect(requestTailoring).not.toHaveBeenCalled()
    expect(tailoring.state.value).toMatchObject({
      failure: {
        code: 'invalid-application-id',
        recovery: 'back-to-applications',
      },
      status: 'failure',
    })
  })

  it.each([
    [
      'application-not-ready',
      409,
      'review-details',
      false,
      'Add a job description and select an active base resume before tailoring.',
    ],
    [
      'authentication-required',
      401,
      'sign-in',
      false,
      'Your session is no longer available. Sign in again to start tailoring.',
    ],
    [
      'tailoring-in-progress',
      409,
      'refresh-application',
      false,
      'Tailoring is already in progress for this application.',
    ],
    [
      'tailoring-unavailable',
      503,
      'retry',
      true,
      'AI tailoring is temporarily unavailable. Try again.',
    ],
    [
      'working-copy-immutable',
      409,
      'refresh-application',
      false,
      'The current working copy can no longer be replaced. Refresh this application to see the latest state.',
    ],
  ] as const)(
    'maps %s to a safe %s recovery state',
    async (code, statusCode, recovery, retryable, message) => {
      const tailoring = useApplicationTailoring(
        createDependencies(
          vi.fn().mockRejectedValue(createEndpointError(code, statusCode)),
        ),
      )

      await expect(tailoring.start(applicationId)).resolves.toBeNull()

      expect(tailoring.state.value).toEqual({
        applicationId,
        failure: { code, message, recovery, retryable },
        status: 'failure',
      })
      expect(JSON.stringify(tailoring.state.value)).not.toContain(
        providerMessage,
      )
    },
  )

  it('requires a refresh rather than a duplicate retry when success is unconfirmed', async () => {
    const requestTailoring = vi
      .fn()
      .mockRejectedValue(new Error(providerMessage))
    const tailoring = useApplicationTailoring(
      createDependencies(requestTailoring),
    )

    await expect(tailoring.start(applicationId)).resolves.toBeNull()
    await expect(tailoring.retry()).resolves.toBeNull()

    expect(requestTailoring).toHaveBeenCalledOnce()
    expect(tailoring.state.value).toMatchObject({
      failure: { code: 'unknown', recovery: 'refresh-application' },
      status: 'failure',
    })
    expect(JSON.stringify(tailoring.state.value)).not.toContain(providerMessage)
  })

  it('retries only a confirmed temporary failure', async () => {
    const requestTailoring = vi
      .fn()
      .mockRejectedValueOnce(createEndpointError('tailoring-unavailable', 503))
      .mockResolvedValueOnce(successResponse)
    const tailoring = useApplicationTailoring(
      createDependencies(requestTailoring),
    )

    await expect(tailoring.start(applicationId)).resolves.toBeNull()
    await expect(tailoring.retry()).resolves.toEqual(successResponse)

    expect(requestTailoring).toHaveBeenNthCalledWith(1, applicationId)
    expect(requestTailoring).toHaveBeenNthCalledWith(2, applicationId)
  })

  it.each([{}, { workingCopy: {} }, { workingCopy: { id: workingCopyId } }])(
    'treats malformed success data as unconfirmed: %o',
    async (invalidResponse) => {
      const tailoring = useApplicationTailoring(
        createDependencies(vi.fn().mockResolvedValue(invalidResponse)),
      )

      await expect(tailoring.start(applicationId)).resolves.toBeNull()

      expect(tailoring.state.value).toMatchObject({
        failure: { code: 'unknown', recovery: 'refresh-application' },
        status: 'failure',
      })
    },
  )
})
