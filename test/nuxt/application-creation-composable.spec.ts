import { describe, expect, it, vi } from 'vitest'

import {
  useApplicationCreation,
  type ApplicationCreationDependencies,
} from '../../app/composables/useApplicationCreation'
import type { ApplicationDetailResponse } from '../../shared/applications/view-model'
import type { CreateApplicationRequest } from '../../shared/applications/management'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'

const minimalInput: CreateApplicationRequest = {
  company: 'Northstar Labs',
  jobDescription: null,
  notes: null,
  postingUrl: null,
  role: 'Senior Frontend Engineer',
  selectedBaseResumeId: null,
}

const minimalResponse: ApplicationDetailResponse = {
  application: {
    appliedOn: null,
    company: minimalInput.company,
    createdAt: '2026-09-07T18:00:00.000Z',
    createdLabel: 'Sep 7, 2026',
    id: applicationId,
    jobDescription: null,
    notes: null,
    postingUrl: null,
    readiness: {
      isReady: false,
      label: 'Not ready for tailoring',
      missingRequirements: [
        { id: 'job-description', label: 'Add a job description' },
        { id: 'base-resume', label: 'Select an active base resume' },
      ],
    },
    role: minimalInput.role,
    selectedBaseResume: null,
    status: 'draft',
    statusLabel: 'Draft',
    statusTone: 'neutral',
    updatedAt: '2026-09-07T18:00:00.000Z',
    updatedLabel: 'Sep 7, 2026',
  },
}

const createDependencies = (
  requestCreation: ApplicationCreationDependencies['requestCreation'],
): ApplicationCreationDependencies => ({ requestCreation })

const createEndpointError = (code: string, statusCode: number) => ({
  data: { data: { code } },
  message: 'Sensitive provider implementation details',
  statusCode,
})

describe('application creation composable', () => {
  it('normalizes one request and shares its promise during repeated submission', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestCreation = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const creation = useApplicationCreation(createDependencies(requestCreation))
    const input = {
      company: '  Northstar Labs  ',
      jobDescription: '   ',
      notes: '   ',
      postingUrl: '   ',
      role: '  Senior Frontend Engineer  ',
      selectedBaseResumeId: null,
    }

    const firstAttempt = creation.create(input)
    const repeatedAttempt = creation.create(input)

    expect(firstAttempt).toBe(repeatedAttempt)
    expect(creation.isBusy.value).toBe(true)
    expect(creation.state.value).toEqual({ status: 'creating' })
    expect(requestCreation).toHaveBeenCalledOnce()
    expect(requestCreation).toHaveBeenCalledWith(minimalInput)

    resolveRequest?.(minimalResponse)

    await expect(firstAttempt).resolves.toEqual(minimalResponse.application)
    expect(creation.state.value).toEqual({
      application: minimalResponse.application,
      status: 'success',
    })
    expect(creation.isBusy.value).toBe(false)
  })

  it('rejects invalid input before transport work', async () => {
    const requestCreation = vi.fn()
    const creation = useApplicationCreation(createDependencies(requestCreation))

    await expect(
      creation.create({ ...minimalInput, company: '   ' }),
    ).resolves.toBeNull()

    expect(requestCreation).not.toHaveBeenCalled()
    expect(creation.state.value).toEqual({
      failure: {
        code: 'invalid-application',
        message:
          'Review the application details and correct any invalid information.',
        recovery: 'review-details',
        retryable: false,
      },
      status: 'failure',
    })
  })

  it('retries only a confirmed pre-persistence authentication failure', async () => {
    const requestCreation = vi
      .fn()
      .mockRejectedValueOnce(
        createEndpointError('authentication-unavailable', 503),
      )
      .mockResolvedValueOnce(minimalResponse)
    const creation = useApplicationCreation(createDependencies(requestCreation))

    await expect(creation.create(minimalInput)).resolves.toBeNull()

    expect(creation.state.value).toMatchObject({
      failure: {
        code: 'authentication-unavailable',
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    })
    expect(creation.canRetry.value).toBe(true)

    await expect(creation.retry()).resolves.toEqual(minimalResponse.application)
    expect(requestCreation).toHaveBeenCalledTimes(2)
    expect(requestCreation).toHaveBeenNthCalledWith(2, minimalInput)
  })

  it('confirms a created application with the requested active base resume', async () => {
    const selectedBaseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
    const input: CreateApplicationRequest = {
      ...minimalInput,
      jobDescription: 'Build calm, accessible product experiences.',
      selectedBaseResumeId,
    }
    const response: ApplicationDetailResponse = {
      application: {
        ...minimalResponse.application,
        jobDescription: input.jobDescription,
        readiness: {
          isReady: true,
          label: 'Ready for tailoring',
          missingRequirements: [],
        },
        selectedBaseResume: {
          availabilityLabel: 'Active',
          filename: 'Frontend Engineering.pdf',
          id: selectedBaseResumeId,
          isAvailable: true,
        },
      },
    }
    const requestCreation = vi.fn().mockResolvedValue(response)
    const creation = useApplicationCreation(createDependencies(requestCreation))

    await expect(creation.create(input)).resolves.toEqual(response.application)
    expect(creation.state.value).toEqual({
      application: response.application,
      status: 'success',
    })
  })

  it.each([
    {
      code: 'authentication-required',
      recovery: 'sign-in',
      statusCode: 401,
    },
    {
      code: 'invalid-application',
      recovery: 'review-details',
      statusCode: 400,
    },
    {
      code: 'selected-base-resume-unavailable',
      recovery: 'refresh-base-resumes',
      statusCode: 409,
    },
  ] as const)(
    'maps $code without exposing provider details',
    async ({ code, recovery, statusCode }) => {
      const requestCreation = vi
        .fn()
        .mockRejectedValue(createEndpointError(code, statusCode))
      const creation = useApplicationCreation(
        createDependencies(requestCreation),
      )

      await creation.create(minimalInput)

      expect(creation.state.value).toMatchObject({
        failure: { code, recovery, retryable: false },
        status: 'failure',
      })
      expect(JSON.stringify(creation.state.value)).not.toContain(
        'Sensitive provider implementation details',
      )
      expect(creation.canRetry.value).toBe(false)
      await expect(creation.retry()).resolves.toBeNull()
      expect(requestCreation).toHaveBeenCalledOnce()
    },
  )

  it.each([
    {
      code: 'application-save-unavailable',
      failure: createEndpointError('application-save-unavailable', 503),
    },
    {
      code: 'unknown',
      failure: new Error('Request connection failed after persistence'),
    },
  ] as const)(
    'does not blindly retry an application whose save result is uncertain',
    async ({ code, failure }) => {
      const requestCreation = vi.fn().mockRejectedValue(failure)
      const creation = useApplicationCreation(
        createDependencies(requestCreation),
      )

      await creation.create(minimalInput)

      expect(creation.state.value).toEqual({
        failure: {
          code,
          message:
            "We couldn't confirm whether the application was created. Check your dashboard before trying again.",
          recovery: 'check-dashboard',
          retryable: false,
        },
        status: 'failure',
      })
      await creation.retry()
      expect(requestCreation).toHaveBeenCalledOnce()
    },
  )

  it('treats a malformed or mismatched success response as unconfirmed', async () => {
    const requestCreation = vi.fn().mockResolvedValue({
      ...minimalResponse,
      application: {
        ...minimalResponse.application,
        company: 'Different company',
      },
    })
    const creation = useApplicationCreation(createDependencies(requestCreation))

    await expect(creation.create(minimalInput)).resolves.toBeNull()

    expect(creation.state.value).toMatchObject({
      failure: { code: 'unknown', recovery: 'check-dashboard' },
      status: 'failure',
    })
  })

  it('does not reset an active request and resets settled state safely', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestCreation = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const creation = useApplicationCreation(createDependencies(requestCreation))

    const pending = creation.create(minimalInput)
    creation.reset()
    expect(creation.state.value.status).toBe('creating')

    resolveRequest?.(minimalResponse)
    await pending
    creation.reset()

    expect(creation.state.value).toEqual({ status: 'idle' })
    expect(creation.canRetry.value).toBe(false)
  })
})
