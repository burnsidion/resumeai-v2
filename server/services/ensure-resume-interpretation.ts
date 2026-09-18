import {
  RESUME_INTERPRETATION_SCHEMA_VERSION,
  RESUME_INTERPRETER_NAME,
  RESUME_INTERPRETER_VERSION,
  type ResumeInterpretationStructuredContent,
} from '../domain/resume-interpretations/contracts'
import {
  calculateResumeInterpretationSha256,
  calculateResumeSourceSha256,
  createResumeInterpretationStructuredContent,
} from '../domain/resume-interpretations/interpret'
import {
  createUnpdfResumeInterpreter,
  type PdfResumeInterpreter,
} from '../infrastructure/pdf/unpdf-resume-interpreter'
import {
  createResumeInterpretationStorage,
  type ResumeInterpretationStorage,
} from '../infrastructure/supabase/resume-interpretation-storage'
import {
  createResumeInterpretationSourceRepository,
  type ResumeInterpretationSourceRepository,
} from '../repositories/resume-interpretation-source'
import {
  createResumeInterpretationsRepository,
  type CreateResumeInterpretationRecord,
  type PersistedResumeInterpretation,
  type ResumeInterpretationIdentity,
  type ResumeInterpretationsRepository,
} from '../repositories/resume-interpretations'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'

export type EnsureResumeInterpretationServiceErrorKind =
  | 'inconsistent-state'
  | 'interpretation-unavailable'
  | 'persistence-unavailable'
  | 'source-integrity-failed'
  | 'source-unavailable'
  | 'storage-unavailable'
  | 'unexpected-failure'

export class EnsureResumeInterpretationServiceError extends Error {
  readonly code = 'resume-interpretation-unavailable'

  constructor(
    readonly kind: EnsureResumeInterpretationServiceErrorKind,
    cause?: unknown,
  ) {
    super('Resume interpretation is temporarily unavailable.', { cause })
    this.name = 'EnsureResumeInterpretationServiceError'
  }
}

export interface EnsureResumeInterpretationDependencies {
  calculateInterpretationSha256(
    content: ResumeInterpretationStructuredContent,
  ): Promise<string>
  calculateSourceSha256(bytes: Uint8Array): Promise<string>
  createInterpreter(): PdfResumeInterpreter
  createInterpretationsRepository(
    context: ProductDataRepositoryContext,
  ): ResumeInterpretationsRepository
  createSourceRepository(
    context: ProductDataRepositoryContext,
  ): ResumeInterpretationSourceRepository
  createStorage(
    client: ProductDataRepositoryContext['client'],
  ): ResumeInterpretationStorage
  createStructuredContent: typeof createResumeInterpretationStructuredContent
}

const defaultDependencies: EnsureResumeInterpretationDependencies = {
  calculateInterpretationSha256: calculateResumeInterpretationSha256,
  calculateSourceSha256: calculateResumeSourceSha256,
  createInterpreter: createUnpdfResumeInterpreter,
  createInterpretationsRepository: createResumeInterpretationsRepository,
  createSourceRepository: createResumeInterpretationSourceRepository,
  createStorage: createResumeInterpretationStorage,
  createStructuredContent: createResumeInterpretationStructuredContent,
}

const createServiceError = (
  kind: EnsureResumeInterpretationServiceErrorKind,
  cause?: unknown,
): EnsureResumeInterpretationServiceError =>
  new EnsureResumeInterpretationServiceError(kind, cause)

const isSha256 = (value: string): boolean => /^[0-9a-f]{64}$/u.test(value)

const createIdentity = (
  baseResumeId: string,
  sourceResumeSha256: string,
): ResumeInterpretationIdentity => ({
  baseResumeId,
  interpreterName: RESUME_INTERPRETER_NAME,
  interpreterVersion: RESUME_INTERPRETER_VERSION,
  schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
  sourceResumeSha256,
})

const matchesExpectedIdentity = (
  interpretation: PersistedResumeInterpretation,
  identity: ResumeInterpretationIdentity,
): boolean =>
  interpretation.baseResumeId === identity.baseResumeId &&
  interpretation.interpreterName === identity.interpreterName &&
  interpretation.interpreterVersion === identity.interpreterVersion &&
  interpretation.schemaVersion === identity.schemaVersion &&
  interpretation.sourceResumeSha256 === identity.sourceResumeSha256

const validatePersistedInterpretation = async (
  interpretation: PersistedResumeInterpretation,
  identity: ResumeInterpretationIdentity,
  dependencies: EnsureResumeInterpretationDependencies,
): Promise<PersistedResumeInterpretation> => {
  if (!matchesExpectedIdentity(interpretation, identity)) {
    throw createServiceError('inconsistent-state')
  }

  let calculatedContentSha256: string

  try {
    calculatedContentSha256 = await dependencies.calculateInterpretationSha256(
      interpretation.structuredContent,
    )
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  if (
    !isSha256(interpretation.contentSha256) ||
    calculatedContentSha256 !== interpretation.contentSha256
  ) {
    throw createServiceError('inconsistent-state')
  }

  return interpretation
}

const findExistingInterpretation = async (
  repository: ResumeInterpretationsRepository,
  identity: ResumeInterpretationIdentity,
): Promise<PersistedResumeInterpretation | null> => {
  try {
    return await repository.findByIdentity(identity)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }
}

export async function ensureResumeInterpretation(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: EnsureResumeInterpretationDependencies = defaultDependencies,
): Promise<PersistedResumeInterpretation> {
  let sourceRepository: ResumeInterpretationSourceRepository
  let interpretationsRepository: ResumeInterpretationsRepository

  try {
    sourceRepository = dependencies.createSourceRepository(context)
    interpretationsRepository =
      dependencies.createInterpretationsRepository(context)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  let source: Awaited<
    ReturnType<ResumeInterpretationSourceRepository['findForApplication']>
  >

  try {
    source = await sourceRepository.findForApplication(applicationId)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (source === null) {
    throw createServiceError('source-unavailable')
  }

  const identity = createIdentity(source.baseResumeId, source.contentSha256)
  const existing = await findExistingInterpretation(
    interpretationsRepository,
    identity,
  )

  if (existing !== null) {
    return validatePersistedInterpretation(existing, identity, dependencies)
  }

  let storage: ResumeInterpretationStorage
  let interpreter: PdfResumeInterpreter

  try {
    storage = dependencies.createStorage(context.client)
    interpreter = dependencies.createInterpreter()
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  let bytes: Uint8Array

  try {
    bytes = await storage.downloadPrivatePdf(source.storageObjectKey)
  } catch (error) {
    throw createServiceError('storage-unavailable', error)
  }

  if (bytes.byteLength !== source.sizeBytes) {
    throw createServiceError('source-integrity-failed')
  }

  let calculatedSourceSha256: string

  try {
    calculatedSourceSha256 = await dependencies.calculateSourceSha256(bytes)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  if (
    !isSha256(calculatedSourceSha256) ||
    calculatedSourceSha256 !== source.contentSha256
  ) {
    throw createServiceError('source-integrity-failed')
  }

  let structuredContent: ResumeInterpretationStructuredContent

  try {
    structuredContent = dependencies.createStructuredContent(
      await interpreter.extract(bytes),
    )
  } catch (error) {
    throw createServiceError('interpretation-unavailable', error)
  }

  let contentSha256: string

  try {
    contentSha256 =
      await dependencies.calculateInterpretationSha256(structuredContent)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  if (!isSha256(contentSha256)) {
    throw createServiceError('inconsistent-state')
  }

  const record: CreateResumeInterpretationRecord = {
    ...identity,
    contentSha256,
    structuredContent,
  }

  try {
    const created = await interpretationsRepository.create(record)

    return validatePersistedInterpretation(created, identity, dependencies)
  } catch (createFailure) {
    if (createFailure instanceof EnsureResumeInterpretationServiceError) {
      throw createFailure
    }

    const concurrentWinner = await findExistingInterpretation(
      interpretationsRepository,
      identity,
    )

    if (concurrentWinner !== null) {
      return validatePersistedInterpretation(
        concurrentWinner,
        identity,
        dependencies,
      )
    }

    throw createServiceError('persistence-unavailable', createFailure)
  }
}
