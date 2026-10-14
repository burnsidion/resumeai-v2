import {
  createTailoringAnalysisRequest,
  type TailoringAnalysisRequest,
} from '../domain/tailoring/analysis'
import {
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
  type ApplicationPersistenceRecord,
} from '../repositories/application-management'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import type { PersistedResumeInterpretation } from '../repositories/resume-interpretations'
import {
  ensureResumeInterpretation,
  EnsureResumeInterpretationServiceError,
} from './ensure-resume-interpretation'

export type PrepareApplicationTailoringErrorKind =
  | 'application-not-ready'
  | 'application-unavailable'
  | 'inconsistent-state'
  | 'interpretation-unavailable'
  | 'unexpected-failure'

export class PrepareApplicationTailoringError extends Error {
  readonly code = 'application-tailoring-unavailable'

  constructor(
    readonly kind: PrepareApplicationTailoringErrorKind,
    cause?: unknown,
  ) {
    super('Application tailoring is temporarily unavailable.', { cause })
    this.name = 'PrepareApplicationTailoringError'
  }
}

export interface PreparedApplicationTailoring {
  analysisRequest: TailoringAnalysisRequest
  application: ApplicationPersistenceRecord
  interpretation: PersistedResumeInterpretation
}

export interface PrepareApplicationTailoringDependencies {
  createApplicationRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationManagementRepository
  ensureInterpretation(
    context: ProductDataRepositoryContext,
    applicationId: string,
  ): ReturnType<typeof ensureResumeInterpretation>
}

const defaultDependencies: PrepareApplicationTailoringDependencies = {
  createApplicationRepository: createApplicationManagementRepository,
  ensureInterpretation: ensureResumeInterpretation,
}

const createServiceError = (
  kind: PrepareApplicationTailoringErrorKind,
  cause?: unknown,
): PrepareApplicationTailoringError =>
  new PrepareApplicationTailoringError(kind, cause)

export const isApplicationReadyForTailoring = (
  application: ApplicationPersistenceRecord | null,
): application is ApplicationPersistenceRecord =>
  application !== null &&
  application.jobDescription !== null &&
  application.jobDescription.trim().length > 0 &&
  application.selectedBaseResume !== null &&
  application.selectedBaseResume.activeSlot !== null &&
  application.selectedBaseResume.retiredAt === null

export async function prepareApplicationTailoring(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: PrepareApplicationTailoringDependencies = defaultDependencies,
): Promise<PreparedApplicationTailoring> {
  let applicationRepository: ApplicationManagementRepository

  try {
    applicationRepository = dependencies.createApplicationRepository(context)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  let application: ApplicationPersistenceRecord | null

  try {
    application = await applicationRepository.findById(applicationId)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  if (application === null) {
    throw createServiceError('application-unavailable')
  }

  if (!isApplicationReadyForTailoring(application)) {
    throw createServiceError('application-not-ready')
  }

  let interpretation: PersistedResumeInterpretation

  try {
    interpretation = await dependencies.ensureInterpretation(
      context,
      applicationId,
    )
  } catch (error) {
    if (error instanceof EnsureResumeInterpretationServiceError) {
      throw createServiceError('interpretation-unavailable', error)
    }

    throw createServiceError('unexpected-failure', error)
  }

  if (interpretation.baseResumeId !== application.selectedBaseResumeId) {
    throw createServiceError('inconsistent-state')
  }

  try {
    return {
      analysisRequest: createTailoringAnalysisRequest({
        jobDescription: application.jobDescription,
        sourceResume: interpretation.structuredContent,
      }),
      application,
      interpretation,
    }
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }
}
