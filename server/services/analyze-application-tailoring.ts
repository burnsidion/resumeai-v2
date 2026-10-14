import {
  type TailoringAnalysis,
  type TailoringAnalysisProvider,
  TailoringAnalysisValidationError,
  validateTailoringAnalysis,
} from '../domain/tailoring/analysis'
import { createConfiguredOpenAiTailoringAnalysisProvider } from '../infrastructure/openai/tailoring-analysis-provider'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import {
  prepareApplicationTailoring,
  PrepareApplicationTailoringError,
  type PreparedApplicationTailoring,
} from './prepare-application-tailoring'

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
  createProvider(): TailoringAnalysisProvider
  prepare(
    context: ProductDataRepositoryContext,
    applicationId: string,
  ): ReturnType<typeof prepareApplicationTailoring>
}

const defaultDependencies: AnalyzeApplicationTailoringDependencies = {
  createProvider: createConfiguredOpenAiTailoringAnalysisProvider,
  prepare: prepareApplicationTailoring,
}

const createServiceError = (
  kind: AnalyzeApplicationTailoringErrorKind,
  cause?: unknown,
): AnalyzeApplicationTailoringError =>
  new AnalyzeApplicationTailoringError(kind, cause)

const mapPreparationError = (
  error: unknown,
): AnalyzeApplicationTailoringError => {
  if (!(error instanceof PrepareApplicationTailoringError)) {
    return createServiceError('unexpected-failure', error)
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

  return createServiceError('unexpected-failure', error)
}

export async function analyzePreparedApplicationTailoring(
  preparation: PreparedApplicationTailoring,
  createProvider: () => TailoringAnalysisProvider,
): Promise<TailoringAnalysis> {
  let provider: TailoringAnalysisProvider

  try {
    provider = createProvider()
  } catch (error) {
    throw createServiceError('provider-unavailable', error)
  }

  let analysis: TailoringAnalysis

  try {
    analysis = await provider.analyze(preparation.analysisRequest)
  } catch (error) {
    throw createServiceError('provider-unavailable', error)
  }

  try {
    return validateTailoringAnalysis(
      analysis,
      preparation.interpretation.structuredContent,
    )
  } catch (error) {
    if (error instanceof TailoringAnalysisValidationError) {
      throw createServiceError('analysis-invalid', error)
    }

    throw createServiceError('unexpected-failure', error)
  }
}

export async function analyzeApplicationTailoring(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: AnalyzeApplicationTailoringDependencies = defaultDependencies,
): Promise<TailoringAnalysis> {
  try {
    return await analyzePreparedApplicationTailoring(
      await dependencies.prepare(context, applicationId),
      dependencies.createProvider,
    )
  } catch (error) {
    if (error instanceof AnalyzeApplicationTailoringError) {
      throw error
    }

    throw mapPreparationError(error)
  }
}
