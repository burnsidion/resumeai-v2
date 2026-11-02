import { describe, expect, it, vi } from 'vitest'

import type { ApplicationManagementRepository } from '../../server/repositories/application-management'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import type {
  CurrentWorkingCopyReviewRecord,
  TailoringWorkingCopiesRepository,
} from '../../server/repositories/tailoring-working-copies'
import {
  loadApplicationWorkingCopyReview,
  type ApplicationWorkingCopyReviewDependencies,
  type ApplicationWorkingCopyReviewServiceError,
} from '../../server/services/application-working-copy-review'
import {
  prepareApplicationWorkingCopySourcePreview,
  type ApplicationWorkingCopySourcePreviewDependencies,
} from '../../server/services/prepare-application-working-copy-source-preview'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const baseResumeId = '6a30d334-411c-4d59-bc58-616590bf9b5a'
const interpretationId = 'f29d3368-467e-43a2-9926-1aee59e14cd4'
const providerMessage = 'Sensitive provider implementation details'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const reviewRecord: CurrentWorkingCopyReviewRecord = {
  applicationId,
  changeSummary: [
    {
      evidenceRefs: ['source-block-002'],
      explanation: 'Emphasizes accessibility work relevant to this role.',
      kind: 'rewritten',
      targetId: 'item-experience-001',
    },
    {
      evidenceRefs: ['source-block-003'],
      explanation: 'Moves the most relevant experience first.',
      kind: 'reordered',
      targetId: 'section-experience',
    },
  ],
  id: workingCopyId,
  proposalSections: [
    {
      heading: 'Experience',
      id: 'section-experience',
      items: [
        {
          evidenceRefs: ['source-block-002'],
          id: 'item-experience-001',
          text: 'Built accessible Vue interfaces used by 20,000 customers.',
        },
      ],
      kind: 'experience',
    },
  ],
  revisionNumber: 2,
  sourceBaseResume: {
    id: baseResumeId,
    originalFilename: 'Jordan_Example_Resume.pdf',
    storageObjectKey: `${userId}/${baseResumeId}.pdf`,
  },
  sourceInterpretation: {
    id: interpretationId,
    structuredContent: {
      sections: [
        {
          heading: 'Experience',
          id: 'section-experience',
          items: [
            {
              evidenceRefs: ['source-block-002'],
              id: 'item-experience-001',
              text: 'Built Vue interfaces.',
            },
          ],
          kind: 'experience',
        },
      ],
      sourceBlocks: [
        {
          id: 'source-block-002',
          order: 1,
          page: 1,
          text: 'Built Vue interfaces.',
          type: 'bullet',
        },
      ],
    },
  },
  state: 'awaiting_review',
  updatedAt: '2026-10-31T00:00:00.000Z',
}

const applicationRepository = {
  findById: vi.fn(async () => ({ id: applicationId })),
} as unknown as ApplicationManagementRepository

const workingCopiesRepository = {
  findCurrentReview: vi.fn(async () => reviewRecord),
} as unknown as TailoringWorkingCopiesRepository

const createReviewDependencies =
  (): ApplicationWorkingCopyReviewDependencies => ({
    createApplicationRepository: () => applicationRepository,
    createWorkingCopiesRepository: () => workingCopiesRepository,
  })

describe('application working-copy review service', () => {
  it('returns only the owned source, proposal, and material review data', async () => {
    const review = await loadApplicationWorkingCopyReview(
      context,
      applicationId,
      createReviewDependencies(),
    )

    expect(review).toEqual({
      changes: [
        {
          changes: [
            {
              explanation:
                'Emphasizes accessibility work relevant to this role.',
              kind: 'rewritten',
            },
            {
              explanation: 'Moves the most relevant experience first.',
              kind: 'reordered',
            },
          ],
          sectionHeading: 'Experience',
        },
      ],
      proposal: {
        sections: [
          {
            heading: 'Experience',
            items: [
              'Built accessible Vue interfaces used by 20,000 customers.',
            ],
          },
        ],
      },
      source: {
        baseResumeId,
        filename: 'Jordan_Example_Resume.pdf',
        sections: [{ heading: 'Experience', items: ['Built Vue interfaces.'] }],
      },
      workingCopy: {
        id: workingCopyId,
        revisionNumber: 2,
        state: 'awaiting_review',
        updatedAt: '2026-10-31T00:00:00.000Z',
      },
    })

    const serialized = JSON.stringify(review)
    expect(serialized).not.toContain('source-block-002')
    expect(serialized).not.toContain('storageObjectKey')
    expect(serialized).not.toContain(interpretationId)
  })

  it('does not invent a review when the application or working copy is unavailable', async () => {
    const unavailableApplication = {
      ...createReviewDependencies(),
      createApplicationRepository: () =>
        ({
          findById: async () => null,
        }) as unknown as ApplicationManagementRepository,
    }
    const unavailableWorkingCopy = {
      ...createReviewDependencies(),
      createWorkingCopiesRepository: () =>
        ({
          findCurrentReview: async () => null,
        }) as unknown as TailoringWorkingCopiesRepository,
    }

    await expect(
      loadApplicationWorkingCopyReview(
        context,
        applicationId,
        unavailableApplication,
      ),
    ).rejects.toMatchObject<ApplicationWorkingCopyReviewServiceError>({
      kind: 'application-unavailable',
    })
    await expect(
      loadApplicationWorkingCopyReview(
        context,
        applicationId,
        unavailableWorkingCopy,
      ),
    ).rejects.toMatchObject<ApplicationWorkingCopyReviewServiceError>({
      kind: 'working-copy-unavailable',
    })
  })

  it('prepares a private source preview for the working copy source without requiring it to be active', async () => {
    const createSignedPreviewUrl = vi.fn(
      async () => 'https://example.test/signed-source-preview.pdf',
    )
    const dependencies: ApplicationWorkingCopySourcePreviewDependencies = {
      ...createReviewDependencies(),
      createStorage: () => ({ createSignedPreviewUrl }),
      now: () => new Date('2026-10-31T00:00:00.000Z'),
    }

    await expect(
      prepareApplicationWorkingCopySourcePreview(
        context,
        applicationId,
        dependencies,
      ),
    ).resolves.toMatchObject({
      baseResumeId,
      originalFilename: 'Jordan_Example_Resume.pdf',
    })
    expect(createSignedPreviewUrl).toHaveBeenCalledWith(
      `${userId}/${baseResumeId}.pdf`,
      300,
    )
  })

  it('sanitizes working-copy persistence failures', async () => {
    const dependencies: ApplicationWorkingCopyReviewDependencies = {
      createApplicationRepository: () => applicationRepository,
      createWorkingCopiesRepository: () =>
        ({
          findCurrentReview: async () => {
            throw new Error(providerMessage)
          },
        }) as unknown as TailoringWorkingCopiesRepository,
    }

    await expect(
      loadApplicationWorkingCopyReview(context, applicationId, dependencies),
    ).rejects.not.toThrow(providerMessage)
  })
})
