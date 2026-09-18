import { describe, expect, it, vi } from 'vitest'

import {
  tailoringAnalysisSchema,
  type TailoringAnalysisProvider,
} from '../../server/domain/tailoring/analysis'
import type {
  ApplicationManagementRepository,
  ApplicationPersistenceRecord,
} from '../../server/repositories/application-management'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import type { PersistedResumeInterpretation } from '../../server/repositories/resume-interpretations'
import { analyzeApplicationTailoring } from '../../server/services/analyze-application-tailoring'
import type {
  AnalyzeApplicationTailoringDependencies,
  AnalyzeApplicationTailoringError,
} from '../../server/services/analyze-application-tailoring'
import {
  RESUME_INTERPRETATION_SCHEMA_VERSION,
  RESUME_INTERPRETER_NAME,
  RESUME_INTERPRETER_VERSION,
  resumeInterpretationStructuredContentSchema,
} from '../../server/domain/resume-interpretations/contracts'
import { syntheticTailoringFixture } from '../fixtures/tailoring'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const interpretationId = 'a9772e5d-40ef-4f9e-b8ca-1b6d6cc8e06c'
const providerMessage = 'Sensitive provider implementation details'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const sourceResume = resumeInterpretationStructuredContentSchema.parse(
  syntheticTailoringFixture.sourceResume,
)

const application: ApplicationPersistenceRecord = {
  appliedOn: null,
  company: 'Lumenworks Studio',
  createdAt: '2026-09-18T00:00:00.000Z',
  id: applicationId,
  jobDescription: syntheticTailoringFixture.jobDescription.text,
  notes: null,
  postingUrl: null,
  role: 'Frontend Engineer',
  selectedBaseResume: {
    activeSlot: 1,
    id: baseResumeId,
    originalFilename: 'Frontend Engineer.pdf',
    retiredAt: null,
  },
  selectedBaseResumeId: baseResumeId,
  status: 'draft',
  updatedAt: '2026-09-18T00:00:00.000Z',
}

const interpretation: PersistedResumeInterpretation = {
  baseResumeId,
  contentSha256: 'a'.repeat(64),
  createdAt: '2026-09-18T00:00:00.000Z',
  id: interpretationId,
  interpreterName: RESUME_INTERPRETER_NAME,
  interpreterVersion: RESUME_INTERPRETER_VERSION,
  schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
  sourceResumeSha256: 'b'.repeat(64),
  structuredContent: sourceResume,
}

const validAnalysis = tailoringAnalysisSchema.parse({
  ...syntheticTailoringFixture.analysis,
  strengths: [
    {
      evidenceRefs: ['source-block-003'],
      explanation:
        'The existing accessibility result is relevant to this role.',
      targetId: 'item-experience-001',
    },
  ],
})

const createDependencies = (
  overrides: {
    application?: ApplicationPersistenceRecord | null
    ensureInterpretation?: AnalyzeApplicationTailoringDependencies['ensureInterpretation']
    provider?: Partial<TailoringAnalysisProvider>
  } = {},
): {
  applicationRepository: ApplicationManagementRepository
  dependencies: AnalyzeApplicationTailoringDependencies
  provider: TailoringAnalysisProvider
} => {
  const applicationRepository = {
    findById: vi.fn(async () =>
      overrides.application === undefined ? application : overrides.application,
    ),
  } as unknown as ApplicationManagementRepository
  const provider = {
    analyze: vi.fn(async () => validAnalysis),
    ...overrides.provider,
  } satisfies TailoringAnalysisProvider
  const dependencies = {
    createApplicationRepository: vi.fn(() => applicationRepository),
    createProvider: vi.fn(() => provider),
    ensureInterpretation:
      overrides.ensureInterpretation ?? vi.fn(async () => interpretation),
  } satisfies AnalyzeApplicationTailoringDependencies

  return { applicationRepository, dependencies, provider }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  kind: AnalyzeApplicationTailoringError['kind'],
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toMatchObject({
      code: 'tailoring-analysis-unavailable',
      kind,
      message: 'AI tailoring analysis is temporarily unavailable.',
    } satisfies Partial<AnalyzeApplicationTailoringError>)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected AI tailoring analysis to fail.')
}

describe('application tailoring analysis service', () => {
  it('coordinates the exact owned application, interpretation, provider, and source validation', async () => {
    const { dependencies, provider } = createDependencies()

    await expect(
      analyzeApplicationTailoring(context, applicationId, dependencies),
    ).resolves.toEqual(validAnalysis)

    expect(dependencies.ensureInterpretation).toHaveBeenCalledWith(
      context,
      applicationId,
    )
    expect(provider.analyze).toHaveBeenCalledWith({
      jobDescription: application.jobDescription,
      sourceResume,
    })
  })

  it('does not create an interpretation or call the provider for an unavailable or unready application', async () => {
    for (const [candidate, kind] of [
      [null, 'application-unavailable'],
      [{ ...application, jobDescription: null }, 'application-not-ready'],
      [
        {
          ...application,
          selectedBaseResume: null,
          selectedBaseResumeId: null,
        },
        'application-not-ready',
      ],
    ] as const) {
      const { dependencies, provider } = createDependencies({
        application: candidate,
      })

      await expectServiceError(
        () => analyzeApplicationTailoring(context, applicationId, dependencies),
        kind,
      )

      expect(dependencies.ensureInterpretation).not.toHaveBeenCalled()
      expect(provider.analyze).not.toHaveBeenCalled()
    }
  })

  it('maps an interpretation failure without calling the provider', async () => {
    const { dependencies, provider } = createDependencies({
      ensureInterpretation: vi.fn(async () => {
        throw new Error(providerMessage)
      }),
    })

    await expectServiceError(
      () => analyzeApplicationTailoring(context, applicationId, dependencies),
      'unexpected-failure',
    )

    expect(provider.analyze).not.toHaveBeenCalled()
  })

  it('maps provider failures to a sanitized recoverable failure', async () => {
    const { dependencies } = createDependencies({
      provider: {
        analyze: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => analyzeApplicationTailoring(context, applicationId, dependencies),
      'provider-unavailable',
    )
  })

  it('rejects unsupported provider output before returning it', async () => {
    const { dependencies } = createDependencies({
      provider: {
        analyze: vi.fn(async () =>
          tailoringAnalysisSchema.parse({
            gaps: [],
            opportunities: [
              {
                evidenceRefs: ['source-block-004'],
                explanation: providerMessage,
                kind: 'rewrite',
                targetId: 'item-experience-001',
              },
            ],
            strengths: [],
          }),
        ),
      },
    })

    await expectServiceError(
      () => analyzeApplicationTailoring(context, applicationId, dependencies),
      'analysis-invalid',
    )
  })
})
