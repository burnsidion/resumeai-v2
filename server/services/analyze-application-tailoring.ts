import {
  createTailoringAnalysisRequest,
  type TailoringAnalysis,
  type TailoringAnalysisProvider,
  TailoringAnalysisValidationError,
  validateTailoringAnalysis,
} from '../domain/tailoring/analysis'
import { createConfiguredOpenAiTailoringAnalysisProvider } from '../infrastructure/openai/tailoring-analysis-provider'
import {
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
} from '../repositories/application-management'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import {
  ensureResumeInterpretation,
  EnsureResumeInterpretationServiceError,
} from './ensure-resume-interpretation'

export type AnalyzeApplicationTailoringErrorKind =
  | 'application-not-ready'
  | 'application-unavailable'
  | 'analysis-invalid'
  | 'interpretation-unavailable'
  | 'provider-unavailable'
  | 'unexpected-failure'

export class AnalyzeApplicationTailoringError extends Error {
  readonly code = 'tailoring-analysis-unavailable'

  constructor(
    readonly kind: AnalyzeApplicationTailoringErrorKind,
    cause?: unknown,
  ) {
    super('AI tailoring analysis is temporarily unavailable.', { cause })
    this.name = 'AnalyzeApplicationTailoringError'
  }
}

export interface AnalyzeApplicationTailoringDependencies {
  createApplicationRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationManagementRepository
  createProvider(): TailoringAnalysisProvider
  ensureInterpretation(
    context: ProductDataRepositoryContext,
    applicationId: string,
  ): ReturnType<typeof ensureResumeInterpretation>
}

const defaultDependencies: AnalyzeApplicationTailoringDependencies = {
  createApplicationRepository: createApplicationManagementRepository,
  createProvider: createConfiguredOpenAiTailoringAnalysisProvider,
  ensureInterpretation: ensureResumeInterpretation,
}

const createServiceError = (
  kind: AnalyzeApplicationTailoringErrorKind,
  cause?: unknown,
): AnalyzeApplicationTailoringError =>
  new AnalyzeApplicationTailoringError(kind, cause)

const isReadyForTailoring = (
  application: Awaited<ReturnType<ApplicationManagementRepository['findById']>>,
): application is NonNullable<
  Awaited<ReturnType<ApplicationManagementRepository['findById']>>
> =>
  application !== null &&
  application.jobDescription !== null &&
  application.jobDescription.trim().length > 0 &&
  application.selectedBaseResume !== null &&
  application.selectedBaseResume.activeSlot !== null &&
  application.selectedBaseResume.retiredAt === null

const createApplicationRepository = (
  context: ProductDataRepositoryContext,
  dependencies: AnalyzeApplicationTailoringDependencies,
): ApplicationManagementRepository => {
  try {
    return dependencies.createApplicationRepository(context)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }
}

export async function analyzeApplicationTailoring(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: AnalyzeApplicationTailoringDependencies = defaultDependencies,
): Promise<TailoringAnalysis> {
  const applicationRepository = createApplicationRepository(
    context,
    dependencies,
  )

  let application: Awaited<
    ReturnType<ApplicationManagementRepository['findById']>
  >

  try {
    application = await applicationRepository.findById(applicationId)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  if (application === null) {
    throw createServiceError('application-unavailable')
  }

  if (!isReadyForTailoring(application)) {
    throw createServiceError('application-not-ready')
  }

  let interpretation: Awaited<ReturnType<typeof ensureResumeInterpretation>>

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

  const request = createTailoringAnalysisRequest({
    jobDescription: application.jobDescription,
    sourceResume: interpretation.structuredContent,
  })

  let provider: TailoringAnalysisProvider

  try {
    provider = dependencies.createProvider()
  } catch (error) {
    throw createServiceError('provider-unavailable', error)
  }

  let analysis: TailoringAnalysis

  try {
    analysis = await provider.analyze(request)
  } catch (error) {
    throw createServiceError('provider-unavailable', error)
  }

  try {
    return validateTailoringAnalysis(analysis, interpretation.structuredContent)
  } catch (error) {
    if (error instanceof TailoringAnalysisValidationError) {
      throw createServiceError('analysis-invalid', error)
    }

    throw createServiceError('unexpected-failure', error)
  }
}
