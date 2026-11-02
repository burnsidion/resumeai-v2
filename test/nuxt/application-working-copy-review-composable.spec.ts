import { describe, expect, it, vi } from 'vitest'

import {
  useApplicationWorkingCopyReview,
  type ApplicationWorkingCopyReviewDependencies,
} from '../../app/composables/useApplicationWorkingCopyReview'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const providerMessage = 'Sensitive provider implementation details'

const response = {
  review: {
    changes: [
      {
        changes: [
          {
            explanation: 'Emphasizes relevant accessibility work.',
            kind: 'rewritten',
          },
        ],
        sectionHeading: 'Experience',
      },
    ],
    proposal: {
      sections: [
        {
          heading: 'Experience',
          items: ['Built accessible Vue interfaces used by 20,000 customers.'],
        },
      ],
    },
    source: {
      baseResumeId,
      filename: 'Frontend Engineering.pdf',
      sections: [{ heading: 'Experience', items: ['Built Vue interfaces.'] }],
    },
    workingCopy: {
      id: workingCopyId,
      revisionNumber: 1,
      state: 'awaiting_review',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  },
}

const createDependencies = (
  requestReview: ApplicationWorkingCopyReviewDependencies['requestReview'],
): ApplicationWorkingCopyReviewDependencies => ({ requestReview })

const createEndpointError = (code: string, statusCode: number) => ({
  data: { data: { code } },
  message: providerMessage,
  statusCode,
})

describe('application working-copy review composable', () => {
  it('loads one trusted review request and shares it while pending', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    const requestReview = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve
        }),
    )
    const review = useApplicationWorkingCopyReview(
      createDependencies(requestReview),
    )

    const firstAttempt = review.load(applicationId)
    const repeatedAttempt = review.load(applicationId)

    expect(firstAttempt).toBe(repeatedAttempt)
    expect(requestReview).toHaveBeenCalledOnce()
    expect(review.state.value).toEqual({ applicationId, status: 'loading' })

    resolveRequest?.(response)

    await expect(firstAttempt).resolves.toEqual(response.review)
    expect(review.state.value).toEqual({
      review: response.review,
      status: 'ready',
    })
  })

  it.each([
    ['authentication-required', 401, 'sign-in', false],
    ['working-copy-unavailable', 404, 'refresh-application', false],
    ['working-copy-review-unavailable', 503, 'retry', true],
  ] as const)(
    'maps %s to a sanitized recovery state',
    async (code, statusCode, recovery, retryable) => {
      const review = useApplicationWorkingCopyReview(
        createDependencies(
          vi.fn().mockRejectedValue(createEndpointError(code, statusCode)),
        ),
      )

      await expect(review.load(applicationId)).resolves.toBeNull()

      expect(review.state.value).toMatchObject({
        applicationId,
        failure: { code, recovery, retryable },
        status: 'failure',
      })
      expect(JSON.stringify(review.state.value)).not.toContain(providerMessage)
    },
  )
})
