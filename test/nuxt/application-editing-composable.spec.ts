import { describe, expect, it, vi } from 'vitest'

import {
  useApplicationEditing,
  type ApplicationEditingDependencies,
} from '../../app/composables/useApplicationEditing'
import type { UpdateApplicationRequest } from '../../shared/applications/management'
import type { ApplicationDetailResponse } from '../../shared/applications/view-model'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const previousUpdatedAt = '2026-09-08T18:00:00.000Z'
const nextUpdatedAt = '2026-09-13T18:00:00.000Z'

const input: UpdateApplicationRequest = {
  company: 'Northstar Labs, Inc.',
  expectedUpdatedAt: previousUpdatedAt,
  jobDescription: 'Build calm, accessible product experiences.',
  role: 'Staff Frontend Engineer',
  selectedBaseResumeId: null,
  status: 'interviewing',
}

const response: ApplicationDetailResponse = {
  application: {
    appliedOn: null,
    company: input.company ?? '',
    createdAt: '2026-09-07T18:00:00.000Z',
    createdLabel: 'Sep 7, 2026',
    id: applicationId,
    jobDescription: input.jobDescription ?? null,
    notes: null,
    postingUrl: null,
    readiness: {
      isReady: false,
      label: 'Not ready for tailoring',
      missingRequirements: [
        { id: 'base-resume', label: 'Select an active base resume' },
      ],
    },
    role: input.role ?? '',
    selectedBaseResume: null,
    status: input.status ?? 'draft',
    statusLabel: 'Interviewing',
    statusTone: 'attention',
    updatedAt: nextUpdatedAt,
    updatedLabel: 'Sep 13, 2026',
  },
}

const createDependencies = (
  requestUpdate: ApplicationEditingDependencies['requestUpdate'],
): ApplicationEditingDependencies => ({ requestUpdate })

const createEndpointError = (code: string, statusCode: number) => ({
  data: { data: { code } },
  message: 'Sensitive provider implementation details',
  statusCode,
})

describe('application editing composable', () => {
  it('normalizes one update and shares its promise during repeated submission', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestUpdate = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const editing = useApplicationEditing(createDependencies(requestUpdate))
    const unnormalizedInput = {
      ...input,
      company: '  Northstar Labs, Inc.  ',
    }

    const firstAttempt = editing.save(applicationId, unnormalizedInput)
    const repeatedAttempt = editing.save(applicationId, input)

    expect(firstAttempt).toBe(repeatedAttempt)
    expect(editing.isBusy.value).toBe(true)
    expect(requestUpdate).toHaveBeenCalledOnce()
    expect(requestUpdate).toHaveBeenCalledWith(applicationId, input)

    resolveRequest?.(response)

    await expect(firstAttempt).resolves.toEqual(response.application)
    expect(editing.state.value).toEqual({
      application: response.application,
      status: 'success',
    })
  })

  it('rejects invalid IDs and updates before transport work', async () => {
    const requestUpdate = vi.fn()
    const editing = useApplicationEditing(createDependencies(requestUpdate))

    await expect(editing.save('not-an-id', input)).resolves.toBeNull()
    expect(editing.state.value).toMatchObject({
      failure: {
        code: 'invalid-application-id',
        recovery: 'back-to-applications',
      },
      status: 'failure',
    })

    editing.reset()
    await expect(
      editing.save(applicationId, { ...input, company: '   ' }),
    ).resolves.toBeNull()
    expect(editing.state.value).toMatchObject({
      failure: { code: 'invalid-application', recovery: 'review-details' },
      status: 'failure',
    })
    expect(requestUpdate).not.toHaveBeenCalled()
  })

  it('allows an explicit retry only after authentication failed before product work', async () => {
    const requestUpdate = vi
      .fn()
      .mockRejectedValueOnce(
        createEndpointError('authentication-unavailable', 503),
      )
      .mockResolvedValueOnce(response)
    const editing = useApplicationEditing(createDependencies(requestUpdate))

    await expect(editing.save(applicationId, input)).resolves.toBeNull()
    expect(editing.state.value).toMatchObject({
      failure: {
        code: 'authentication-unavailable',
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    })
    expect(editing.canRetry.value).toBe(true)

    await expect(editing.retry()).resolves.toEqual(response.application)
    expect(requestUpdate).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      code: 'authentication-required',
      recovery: 'sign-in',
      statusCode: 401,
    },
    {
      code: 'application-update-conflict',
      recovery: 'refresh-application',
      statusCode: 409,
    },
    {
      code: 'selected-base-resume-unavailable',
      recovery: 'refresh-base-resumes',
      statusCode: 409,
    },
    {
      code: 'application-unavailable',
      recovery: 'back-to-applications',
      statusCode: 404,
    },
    {
      code: 'invalid-application',
      recovery: 'review-details',
      statusCode: 400,
    },
  ] as const)(
    'maps $code without exposing provider details',
    async ({ code, recovery, statusCode }) => {
      const requestUpdate = vi
        .fn()
        .mockRejectedValue(createEndpointError(code, statusCode))
      const editing = useApplicationEditing(createDependencies(requestUpdate))

      await editing.save(applicationId, input)

      expect(editing.state.value).toMatchObject({
        failure: { code, recovery, retryable: false },
        status: 'failure',
      })
      expect(JSON.stringify(editing.state.value)).not.toContain(
        'Sensitive provider implementation details',
      )
      expect(editing.canRetry.value).toBe(false)
    },
  )

  it.each([
    createEndpointError('application-save-unavailable', 503),
    new Error('Request connection failed after persistence'),
  ])(
    'does not retry an update whose persistence result is uncertain',
    async (failure) => {
      const requestUpdate = vi.fn().mockRejectedValue(failure)
      const editing = useApplicationEditing(createDependencies(requestUpdate))

      await editing.save(applicationId, input)

      expect(editing.state.value).toMatchObject({
        failure: {
          recovery: 'refresh-application',
          retryable: false,
        },
        status: 'failure',
      })
      await editing.retry()
      expect(requestUpdate).toHaveBeenCalledOnce()
    },
  )

  it.each([
    {
      ...response,
      application: { ...response.application, company: 'Wrong Company' },
    },
    {
      ...response,
      application: {
        ...response.application,
        updatedAt: previousUpdatedAt,
      },
    },
    { application: { id: applicationId } },
  ])(
    'rejects a malformed, mismatched, or stale success response',
    async (result) => {
      const requestUpdate = vi.fn().mockResolvedValue(result)
      const editing = useApplicationEditing(createDependencies(requestUpdate))

      await expect(editing.save(applicationId, input)).resolves.toBeNull()
      expect(editing.state.value).toMatchObject({
        failure: { code: 'unknown', recovery: 'refresh-application' },
        status: 'failure',
      })
    },
  )

  it('does not reset an active request and resets settled state safely', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestUpdate = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const editing = useApplicationEditing(createDependencies(requestUpdate))

    const pending = editing.save(applicationId, input)
    editing.reset()
    expect(editing.state.value.status).toBe('saving')

    resolveRequest?.(response)
    await pending
    editing.reset()

    expect(editing.state.value).toEqual({ status: 'idle' })
    expect(editing.canRetry.value).toBe(false)
  })
})
