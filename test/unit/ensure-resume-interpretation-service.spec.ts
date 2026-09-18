import { describe, expect, it, vi } from 'vitest'

import {
  RESUME_INTERPRETATION_SCHEMA_VERSION,
  RESUME_INTERPRETER_NAME,
  RESUME_INTERPRETER_VERSION,
} from '../../server/domain/resume-interpretations/contracts'
import { createResumeInterpretationStructuredContent } from '../../server/domain/resume-interpretations/interpret'
import type { PdfResumeInterpreter } from '../../server/infrastructure/pdf/unpdf-resume-interpreter'
import type { ResumeInterpretationStorage } from '../../server/infrastructure/supabase/resume-interpretation-storage'
import type {
  ResumeInterpretationSource,
  ResumeInterpretationSourceRepository,
} from '../../server/repositories/resume-interpretation-source'
import type {
  PersistedResumeInterpretation,
  ResumeInterpretationsRepository,
} from '../../server/repositories/resume-interpretations'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import {
  ensureResumeInterpretation,
  EnsureResumeInterpretationServiceError,
  type EnsureResumeInterpretationDependencies,
} from '../../server/services/ensure-resume-interpretation'
import {
  createSyntheticResumePdf,
  syntheticResumeExtraction,
} from '../fixtures/resume-interpretation'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const interpretationId = 'a9772e5d-40ef-4f9e-b8ca-1b6d6cc8e06c'
const sourceResumeSha256 = 'a'.repeat(64)
const contentSha256 = 'b'.repeat(64)
const providerMessage = 'Sensitive provider implementation details'
const pdfBytes = createSyntheticResumePdf()
const structuredContent = createResumeInterpretationStructuredContent(
  syntheticResumeExtraction,
)

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const source: ResumeInterpretationSource = {
  baseResumeId,
  contentSha256: sourceResumeSha256,
  originalFilename: 'Frontend Engineer.pdf',
  sizeBytes: pdfBytes.byteLength,
  storageObjectKey: `${userId}/${baseResumeId}.pdf`,
}

const persisted: PersistedResumeInterpretation = {
  baseResumeId,
  contentSha256,
  createdAt: '2026-09-17T06:15:00.000Z',
  id: interpretationId,
  interpreterName: RESUME_INTERPRETER_NAME,
  interpreterVersion: RESUME_INTERPRETER_VERSION,
  schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
  sourceResumeSha256,
  structuredContent,
}

const createDependencies = (
  overrides: {
    interpreter?: Partial<PdfResumeInterpreter>
    interpretationsRepository?: Partial<ResumeInterpretationsRepository>
    sourceRepository?: Partial<ResumeInterpretationSourceRepository>
    storage?: Partial<ResumeInterpretationStorage>
  } = {},
): {
  dependencies: EnsureResumeInterpretationDependencies
  interpreter: PdfResumeInterpreter
  interpretationsRepository: ResumeInterpretationsRepository
  sourceRepository: ResumeInterpretationSourceRepository
  storage: ResumeInterpretationStorage
} => {
  const sourceRepository = {
    findForApplication: vi.fn(async () => source),
    ...overrides.sourceRepository,
  } satisfies ResumeInterpretationSourceRepository
  const interpretationsRepository = {
    create: vi.fn(async () => persisted),
    findByIdentity: vi.fn(async () => null),
    ...overrides.interpretationsRepository,
  } satisfies ResumeInterpretationsRepository
  const storage = {
    downloadPrivatePdf: vi.fn(async () => pdfBytes),
    ...overrides.storage,
  } satisfies ResumeInterpretationStorage
  const interpreter = {
    extract: vi.fn(async () => syntheticResumeExtraction),
    ...overrides.interpreter,
  } satisfies PdfResumeInterpreter
  const dependencies = {
    calculateInterpretationSha256: vi.fn(async () => contentSha256),
    calculateSourceSha256: vi.fn(async () => sourceResumeSha256),
    createInterpreter: vi.fn(() => interpreter),
    createInterpretationsRepository: vi.fn(() => interpretationsRepository),
    createSourceRepository: vi.fn(() => sourceRepository),
    createStorage: vi.fn(() => storage),
    createStructuredContent: vi.fn(() => structuredContent),
  } satisfies EnsureResumeInterpretationDependencies

  return {
    dependencies,
    interpreter,
    interpretationsRepository,
    sourceRepository,
    storage,
  }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  kind: EnsureResumeInterpretationServiceError['kind'],
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(EnsureResumeInterpretationServiceError)
    expect(error).toMatchObject({
      code: 'resume-interpretation-unavailable',
      kind,
      message: 'Resume interpretation is temporarily unavailable.',
    } satisfies Partial<EnsureResumeInterpretationServiceError>)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the resume interpretation service to fail.')
}

describe('resume interpretation service', () => {
  it('reuses an exact existing interpretation without downloading or parsing', async () => {
    const { dependencies, interpreter, interpretationsRepository, storage } =
      createDependencies({
        interpretationsRepository: {
          findByIdentity: vi.fn(async () => persisted),
        },
      })

    await expect(
      ensureResumeInterpretation(context, applicationId, dependencies),
    ).resolves.toEqual(persisted)

    expect(interpretationsRepository.findByIdentity).toHaveBeenCalledWith({
      baseResumeId,
      interpreterName: RESUME_INTERPRETER_NAME,
      interpreterVersion: RESUME_INTERPRETER_VERSION,
      schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
      sourceResumeSha256,
    })
    expect(dependencies.createStorage).not.toHaveBeenCalled()
    expect(dependencies.createInterpreter).not.toHaveBeenCalled()
    expect(storage.downloadPrivatePdf).not.toHaveBeenCalled()
    expect(interpreter.extract).not.toHaveBeenCalled()
    expect(interpretationsRepository.create).not.toHaveBeenCalled()
  })

  it('verifies the downloaded source before creating an immutable interpretation', async () => {
    const { dependencies, interpreter, interpretationsRepository, storage } =
      createDependencies()

    await expect(
      ensureResumeInterpretation(context, applicationId, dependencies),
    ).resolves.toEqual(persisted)

    expect(storage.downloadPrivatePdf).toHaveBeenCalledWith(
      source.storageObjectKey,
    )
    expect(dependencies.calculateSourceSha256).toHaveBeenCalledWith(pdfBytes)
    expect(interpreter.extract).toHaveBeenCalledWith(pdfBytes)
    expect(interpretationsRepository.create).toHaveBeenCalledWith({
      baseResumeId,
      contentSha256,
      interpreterName: RESUME_INTERPRETER_NAME,
      interpreterVersion: RESUME_INTERPRETER_VERSION,
      schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
      sourceResumeSha256,
      structuredContent,
    })
  })

  it('refuses to parse or persist a downloaded PDF whose identity changed', async () => {
    const { dependencies, interpreter, interpretationsRepository } =
      createDependencies({
        storage: {
          downloadPrivatePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
        },
      })

    await expectServiceError(
      () => ensureResumeInterpretation(context, applicationId, dependencies),
      'source-integrity-failed',
    )

    expect(interpreter.extract).not.toHaveBeenCalled()
    expect(interpretationsRepository.create).not.toHaveBeenCalled()
  })

  it('does not attempt private Storage access without an active selected source', async () => {
    const { dependencies, storage } = createDependencies({
      sourceRepository: {
        findForApplication: vi.fn(async () => null),
      },
    })

    await expectServiceError(
      () => ensureResumeInterpretation(context, applicationId, dependencies),
      'source-unavailable',
    )

    expect(dependencies.createStorage).not.toHaveBeenCalled()
    expect(storage.downloadPrivatePdf).not.toHaveBeenCalled()
  })

  it('maps parser failures to a sanitized recoverable interpretation failure', async () => {
    const { dependencies, interpretationsRepository } = createDependencies({
      interpreter: {
        extract: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => ensureResumeInterpretation(context, applicationId, dependencies),
      'interpretation-unavailable',
    )

    expect(interpretationsRepository.create).not.toHaveBeenCalled()
  })

  it('reuses the concurrent winner after an ambiguous immutable insert failure', async () => {
    const { dependencies, interpretationsRepository } = createDependencies({
      interpretationsRepository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        findByIdentity: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(persisted),
      },
    })

    await expect(
      ensureResumeInterpretation(context, applicationId, dependencies),
    ).resolves.toEqual(persisted)

    expect(interpretationsRepository.findByIdentity).toHaveBeenCalledTimes(2)
  })

  it('surfaces an ambiguous insert with no persisted winner as a persistence failure', async () => {
    const { dependencies } = createDependencies({
      interpretationsRepository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => ensureResumeInterpretation(context, applicationId, dependencies),
      'persistence-unavailable',
    )
  })
})
