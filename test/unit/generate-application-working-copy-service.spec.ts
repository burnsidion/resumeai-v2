import { describe, expect, it, vi } from 'vitest'

import { tailoringAnalysisSchema } from '../../server/domain/tailoring/analysis'
import {
  calculateTailoringWorkingCopySha256,
  tailoringWorkingCopyProposalSchema,
  type TailoringWorkingCopyProvider,
} from '../../server/domain/tailoring/working-copy'
import type {
  ApplicationManagementRepository,
  ApplicationPersistenceRecord,
} from '../../server/repositories/application-management'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import type { PersistedResumeInterpretation } from '../../server/repositories/resume-interpretations'
import type { TailoringOperationsRepository } from '../../server/repositories/tailoring-operations'
import type {
  PersistedCurrentWorkingCopy,
  TailoringWorkingCopiesRepository,
} from '../../server/repositories/tailoring-working-copies'
import {
  generateApplicationWorkingCopy,
  type GenerateApplicationWorkingCopyDependencies,
  type GenerateApplicationWorkingCopyError,
} from '../../server/services/generate-application-working-copy'
import type { PreparedApplicationTailoring } from '../../server/services/prepare-application-tailoring'
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
const operationId = 'e70f3d83-1d5e-4fc7-8740-1c2ed1f9ab53'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const providerMessage = 'Sensitive provider implementation details'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const sourceResume = resumeInterpretationStructuredContentSchema.parse(
  syntheticTailoringFixture.sourceResume,
)
const analysis = tailoringAnalysisSchema.parse({
  ...syntheticTailoringFixture.analysis,
  strengths: [],
})
const proposal = tailoringWorkingCopyProposalSchema.parse(
  syntheticTailoringFixture.workingCopy,
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
const preparation: PreparedApplicationTailoring = {
  analysisRequest: {
    jobDescription: application.jobDescription,
    sourceResume,
  },
  application,
  interpretation,
}
const persisted: PersistedCurrentWorkingCopy = {
  id: workingCopyId,
  revisionNumber: 1,
  updatedAt: '2026-10-11T00:00:00.000Z',
}

const createDependencies = (
  overrides: Partial<GenerateApplicationWorkingCopyDependencies> = {},
): {
  analysisProvider: { analyze: ReturnType<typeof vi.fn> }
  dependencies: GenerateApplicationWorkingCopyDependencies
  operations: {
    acquire: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
  workingCopies: { replaceCurrent: ReturnType<typeof vi.fn> }
  workingCopyProvider: TailoringWorkingCopyProvider
} => {
  const applicationRepository = {
    findById: vi.fn(async () => application),
  } as unknown as ApplicationManagementRepository
  const operations = {
    acquire: vi.fn(async () => ({
      applicationId,
      id: operationId,
      leaseExpiresAt: '2026-10-11T00:02:00.000Z',
    })),
    release: vi.fn(async () => undefined),
  }
  const analysisProvider = { analyze: vi.fn(async () => analysis) }
  const workingCopyProvider = {
    metadata: {
      modelName: 'test-tailoring-model',
      promptVersion: 'v1',
      providerName: 'openai-responses',
    },
    propose: vi.fn(async () => proposal),
  } satisfies TailoringWorkingCopyProvider
  const workingCopies = { replaceCurrent: vi.fn(async () => persisted) }
  const dependencies = {
    calculateWorkingCopySha256: calculateTailoringWorkingCopySha256,
    createAnalysisProvider: vi.fn(() => analysisProvider),
    createApplicationRepository: vi.fn(() => applicationRepository),
    createOperationRepository: vi.fn(
      () => operations as TailoringOperationsRepository,
    ),
    createWorkingCopyProvider: vi.fn(() => workingCopyProvider),
    createWorkingCopiesRepository: vi.fn(
      () => workingCopies as TailoringWorkingCopiesRepository,
    ),
    now: () => new Date('2026-10-11T00:00:00.000Z'),
    prepare: vi.fn(async () => preparation),
    ...overrides,
  } satisfies GenerateApplicationWorkingCopyDependencies

  return {
    analysisProvider,
    dependencies,
    operations,
    workingCopies,
    workingCopyProvider,
  }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  kind: GenerateApplicationWorkingCopyError['kind'],
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toMatchObject({
      code: 'tailoring-working-copy-unavailable',
      kind,
      message: 'AI tailoring is temporarily unavailable.',
    } satisfies Partial<GenerateApplicationWorkingCopyError>)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected working-copy generation to fail.')
}

describe('application working-copy generation service', () => {
  it('serially coordinates trusted preparation, analysis, rewrite validation, persistence, and lease cleanup', async () => {
    const {
      analysisProvider,
      dependencies,
      operations,
      workingCopies,
      workingCopyProvider,
    } = createDependencies()

    await expect(
      generateApplicationWorkingCopy(context, applicationId, dependencies),
    ).resolves.toEqual(persisted)

    expect(operations.acquire).toHaveBeenCalledWith({
      applicationId,
      expiredAt: '2026-10-11T00:00:00.000Z',
      leaseExpiresAt: '2026-10-11T00:02:00.000Z',
    })
    expect(analysisProvider.analyze).toHaveBeenCalledWith(
      preparation.analysisRequest,
    )
    expect(workingCopyProvider.propose).toHaveBeenCalledOnce()
    expect(workingCopies.replaceCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId,
        proposal,
        sourceBaseResumeId: baseResumeId,
        sourceInterpretationId: interpretationId,
      }),
    )
    expect(operations.release).toHaveBeenCalledWith(operationId)
  })

  it('does not start an AI request when another generation lease is active', async () => {
    const {
      analysisProvider,
      dependencies,
      operations,
      workingCopies,
      workingCopyProvider,
    } = createDependencies({
      createOperationRepository: () =>
        ({
          acquire: async () => null,
          release: async () => undefined,
        }) satisfies TailoringOperationsRepository,
    })

    await expectServiceError(
      () =>
        generateApplicationWorkingCopy(context, applicationId, dependencies),
      'operation-in-progress',
    )

    expect(analysisProvider.analyze).not.toHaveBeenCalled()
    expect(workingCopyProvider.propose).not.toHaveBeenCalled()
    expect(workingCopies.replaceCurrent).not.toHaveBeenCalled()
    expect(operations.release).not.toHaveBeenCalled()
  })

  it('rejects unsupported rewrite output without replacing the current copy and releases its lease', async () => {
    const invalidProposal = {
      ...proposal,
      sections: proposal.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              items: [
                {
                  ...section.items[0],
                  evidenceRefs: ['source-block-999'],
                  text: 'Built accessible Vue interfaces used by 20,000 customers.',
                },
              ],
            }
          : section,
      ),
    }
    const { dependencies, operations, workingCopies } = createDependencies({
      createWorkingCopyProvider: () => ({
        metadata: {
          modelName: 'test-tailoring-model',
          promptVersion: 'v1',
          providerName: 'openai-responses',
        },
        propose: async () => invalidProposal,
      }),
    })

    await expectServiceError(
      () =>
        generateApplicationWorkingCopy(context, applicationId, dependencies),
      'working-copy-invalid',
    )

    expect(workingCopies.replaceCurrent).not.toHaveBeenCalled()
    expect(operations.release).toHaveBeenCalledWith(operationId)
  })

  it('maps provider failures without exposing their details and releases the lease', async () => {
    const { dependencies, operations, workingCopies } = createDependencies({
      createWorkingCopyProvider: () => ({
        metadata: {
          modelName: 'test-tailoring-model',
          promptVersion: 'v1',
          providerName: 'openai-responses',
        },
        propose: async () => {
          throw new Error(providerMessage)
        },
      }),
    })

    await expectServiceError(
      () =>
        generateApplicationWorkingCopy(context, applicationId, dependencies),
      'provider-unavailable',
    )

    expect(workingCopies.replaceCurrent).not.toHaveBeenCalled()
    expect(operations.release).toHaveBeenCalledWith(operationId)
  })
})
