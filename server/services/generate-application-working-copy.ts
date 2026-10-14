import {
  analyzePreparedApplicationTailoring,
  AnalyzeApplicationTailoringError,
} from './analyze-application-tailoring'
import {
  calculateTailoringWorkingCopySha256,
  createTailoringWorkingCopyRequest,
  tailoringWorkingCopyProvenanceSchema,
  TailoringWorkingCopyValidationError,
  validateTailoringWorkingCopy,
  type TailoringWorkingCopyProvider,
} from '../domain/tailoring/working-copy'
import { createConfiguredOpenAiTailoringAnalysisProvider } from '../infrastructure/openai/tailoring-analysis-provider'
import { createConfiguredOpenAiTailoringWorkingCopyProvider } from '../infrastructure/openai/tailoring-working-copy-provider'
import {
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
} from '../repositories/application-management'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import {
  createTailoringOperationsRepository,
  type TailoringOperationsRepository,
} from '../repositories/tailoring-operations'
import {
  createTailoringWorkingCopiesRepository,
  TailoringWorkingCopiesRepositoryError,
  type PersistedCurrentWorkingCopy,
  type TailoringWorkingCopiesRepository,
} from '../repositories/tailoring-working-copies'
import {
  isApplicationReadyForTailoring,
  prepareApplicationTailoring,
  PrepareApplicationTailoringError,
  type PreparedApplicationTailoring,
} from './prepare-application-tailoring'

const TAILORING_OPERATION_LEASE_MS = 2 * 60 * 1000

export type GenerateApplicationWorkingCopyErrorKind =
  | 'analysis-invalid'
  | 'application-not-ready'
  | 'application-unavailable'
  | 'inconsistent-state'
  | 'interpretation-unavailable'
  | 'operation-in-progress'
  | 'operation-unavailable'
  | 'provider-unavailable'
  | 'working-copy-immutable'
  | 'working-copy-invalid'
  | 'working-copy-unavailable'

export class GenerateApplicationWorkingCopyError extends Error {
  readonly code = 'tailoring-working-copy-unavailable'

  constructor(
    readonly kind: GenerateApplicationWorkingCopyErrorKind,
    cause?: unknown,
  ) {
    super('AI tailoring is temporarily unavailable.', { cause })
    this.name = 'GenerateApplicationWorkingCopyError'
  }
}

export interface GenerateApplicationWorkingCopyDependencies {
  calculateWorkingCopySha256: typeof calculateTailoringWorkingCopySha256
  createAnalysisProvider: typeof createConfiguredOpenAiTailoringAnalysisProvider
  createApplicationRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationManagementRepository
  createOperationRepository(
    context: ProductDataRepositoryContext,
  ): TailoringOperationsRepository
  createWorkingCopyProvider: typeof createConfiguredOpenAiTailoringWorkingCopyProvider
  createWorkingCopiesRepository(
    context: ProductDataRepositoryContext,
  ): TailoringWorkingCopiesRepository
  now(): Date
  prepare(
    context: ProductDataRepositoryContext,
    applicationId: string,
  ): ReturnType<typeof prepareApplicationTailoring>
}

const defaultDependencies: GenerateApplicationWorkingCopyDependencies = {
  calculateWorkingCopySha256: calculateTailoringWorkingCopySha256,
  createAnalysisProvider: createConfiguredOpenAiTailoringAnalysisProvider,
  createApplicationRepository: createApplicationManagementRepository,
  createOperationRepository: createTailoringOperationsRepository,
  createWorkingCopyProvider: createConfiguredOpenAiTailoringWorkingCopyProvider,
  createWorkingCopiesRepository: createTailoringWorkingCopiesRepository,
  now: () => new Date(),
  prepare: prepareApplicationTailoring,
}

const createServiceError = (
  kind: GenerateApplicationWorkingCopyErrorKind,
  cause?: unknown,
): GenerateApplicationWorkingCopyError =>
  new GenerateApplicationWorkingCopyError(kind, cause)

const mapPreparationError = (
  error: unknown,
): GenerateApplicationWorkingCopyError => {
  if (!(error instanceof PrepareApplicationTailoringError)) {
    return createServiceError('inconsistent-state', error)
  }

  if (error.kind === 'application-not-ready') {
    return createServiceError('application-not-ready', error)
  }

  if (error.kind === 'application-unavailable') {
    return createServiceError('application-unavailable', error)
  }

  if (error.kind === 'interpretation-unavailable') {
    return createServiceError('interpretation-unavailable', error)
  }

  return createServiceError('inconsistent-state', error)
}

const mapAnalysisError = (
  error: unknown,
): GenerateApplicationWorkingCopyError => {
  if (!(error instanceof AnalyzeApplicationTailoringError)) {
    return createServiceError('provider-unavailable', error)
  }

  if (error.kind === 'analysis-invalid') {
    return createServiceError('analysis-invalid', error)
  }

  if (error.kind === 'provider-unavailable') {
    return createServiceError('provider-unavailable', error)
  }

  return createServiceError('inconsistent-state', error)
}

const preflightApplication = async (
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: GenerateApplicationWorkingCopyDependencies,
): Promise<void> => {
  let repository: ApplicationManagementRepository

  try {
    repository = dependencies.createApplicationRepository(context)
  } catch (error) {
    throw createServiceError('operation-unavailable', error)
  }

  let application: Awaited<
    ReturnType<ApplicationManagementRepository['findById']>
  >

  try {
    application = await repository.findById(applicationId)
  } catch (error) {
    throw createServiceError('operation-unavailable', error)
  }

  if (application === null) {
    throw createServiceError('application-unavailable')
  }

  if (!isApplicationReadyForTailoring(application)) {
    throw createServiceError('application-not-ready')
  }
}

const createProvenance = (
  preparation: PreparedApplicationTailoring,
  provider: TailoringWorkingCopyProvider,
) =>
  tailoringWorkingCopyProvenanceSchema.parse({
    ...provider.metadata,
    sourceInterpretationSha256: preparation.interpretation.contentSha256,
    sourceResumeSha256: preparation.interpretation.sourceResumeSha256,
  })

export async function generateApplicationWorkingCopy(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: GenerateApplicationWorkingCopyDependencies = defaultDependencies,
): Promise<PersistedCurrentWorkingCopy> {
  await preflightApplication(context, applicationId, dependencies)

  const now = dependencies.now()
  const leaseExpiresAt = new Date(
    now.getTime() + TAILORING_OPERATION_LEASE_MS,
  ).toISOString()
  let operations: TailoringOperationsRepository

  try {
    operations = dependencies.createOperationRepository(context)
  } catch (error) {
    throw createServiceError('operation-unavailable', error)
  }

  let operation: Awaited<ReturnType<TailoringOperationsRepository['acquire']>>

  try {
    operation = await operations.acquire({
      applicationId,
      expiredAt: now.toISOString(),
      leaseExpiresAt,
    })
  } catch (error) {
    throw createServiceError('operation-unavailable', error)
  }

  if (operation === null) {
    throw createServiceError('operation-in-progress')
  }

  try {
    let preparation: PreparedApplicationTailoring

    try {
      preparation = await dependencies.prepare(context, applicationId)
    } catch (error) {
      throw mapPreparationError(error)
    }

    let analysis

    try {
      analysis = await analyzePreparedApplicationTailoring(
        preparation,
        dependencies.createAnalysisProvider,
      )
    } catch (error) {
      throw mapAnalysisError(error)
    }

    let provider: TailoringWorkingCopyProvider

    try {
      provider = dependencies.createWorkingCopyProvider()
    } catch (error) {
      throw createServiceError('provider-unavailable', error)
    }

    let proposal

    try {
      proposal = await provider.propose(
        createTailoringWorkingCopyRequest({
          analysis,
          jobDescription: preparation.analysisRequest.jobDescription,
          sourceResume: preparation.interpretation.structuredContent,
        }),
      )
    } catch (error) {
      throw createServiceError('provider-unavailable', error)
    }

    try {
      proposal = validateTailoringWorkingCopy(
        proposal,
        preparation.interpretation.structuredContent,
      )
    } catch (error) {
      if (error instanceof TailoringWorkingCopyValidationError) {
        throw createServiceError('working-copy-invalid', error)
      }

      throw createServiceError('inconsistent-state', error)
    }

    let contentSha256: string

    try {
      contentSha256 = await dependencies.calculateWorkingCopySha256(proposal)
    } catch (error) {
      throw createServiceError('inconsistent-state', error)
    }

    let repository: TailoringWorkingCopiesRepository

    try {
      repository = dependencies.createWorkingCopiesRepository(context)
      return await repository.replaceCurrent({
        applicationId,
        contentSha256,
        proposal,
        provenance: createProvenance(preparation, provider),
        sourceBaseResumeId: preparation.interpretation.baseResumeId,
        sourceInterpretationId: preparation.interpretation.id,
        updatedAt: dependencies.now().toISOString(),
      })
    } catch (error) {
      if (
        error instanceof TailoringWorkingCopiesRepositoryError &&
        error.kind === 'accepted-working-copy'
      ) {
        throw createServiceError('working-copy-immutable', error)
      }

      throw createServiceError('working-copy-unavailable', error)
    }
  } finally {
    try {
      await operations.release(operation.id)
    } catch {
      // A bounded lease makes cleanup recoverable without replacing a valid result.
    }
  }
}
