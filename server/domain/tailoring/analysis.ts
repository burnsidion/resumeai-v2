import { z } from 'zod'

import {
  resumeInterpretationStructuredContentSchema,
  type ResumeInterpretationStructuredContent,
} from '../resume-interpretations/contracts'

const stableIdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]*$/u)

const analysisFindingSchema = z
  .object({
    evidenceRefs: z.array(stableIdentifierSchema).min(1),
    explanation: z.string().trim().min(1),
    targetId: stableIdentifierSchema,
  })
  .strict()

const analysisOpportunityKinds = ['omit', 'reorder', 'rewrite'] as const

const analysisOpportunitySchema = analysisFindingSchema
  .extend({
    kind: z.enum(analysisOpportunityKinds),
  })
  .strict()

const analysisGapSchema = z
  .object({
    explanation: z.string().trim().min(1),
    requirement: z.string().trim().min(1),
  })
  .strict()

export const tailoringAnalysisSchema = z
  .object({
    gaps: z.array(analysisGapSchema),
    opportunities: z.array(analysisOpportunitySchema),
    strengths: z.array(analysisFindingSchema),
  })
  .strict()

export const tailoringAnalysisRequestSchema = z
  .object({
    jobDescription: z.string().trim().min(1),
    sourceResume: resumeInterpretationStructuredContentSchema,
  })
  .strict()

export type TailoringAnalysis = z.infer<typeof tailoringAnalysisSchema>
export type TailoringAnalysisRequest = z.infer<
  typeof tailoringAnalysisRequestSchema
>

export interface TailoringAnalysisProviderInput {
  jobDescription: string
  sourceResume: ResumeInterpretationStructuredContent
}

export interface TailoringAnalysisProvider {
  analyze(request: TailoringAnalysisRequest): Promise<TailoringAnalysis>
}

export type TailoringAnalysisValidationErrorKind =
  'invalid-structure' | 'unsupported-evidence'

export class TailoringAnalysisValidationError extends Error {
  readonly code = 'tailoring-analysis-invalid'

  constructor(
    readonly kind: TailoringAnalysisValidationErrorKind,
    cause?: unknown,
  ) {
    super('The tailoring analysis could not be validated.', { cause })
    this.name = 'TailoringAnalysisValidationError'
  }
}

const createValidationError = (
  kind: TailoringAnalysisValidationErrorKind,
  cause?: unknown,
): TailoringAnalysisValidationError =>
  new TailoringAnalysisValidationError(kind, cause)

const parseAnalysis = (analysis: unknown): TailoringAnalysis => {
  try {
    return tailoringAnalysisSchema.parse(analysis)
  } catch (error) {
    throw createValidationError('invalid-structure', error)
  }
}

const collectTargetEvidence = (
  sourceResume: ResumeInterpretationStructuredContent,
): Map<string, Set<string>> => {
  const targetEvidence = new Map<string, Set<string>>()
  const providerVisibleSourceBlockIds = new Set(
    sourceResume.sourceBlocks
      .filter((sourceBlock) => sourceBlock.type !== 'contact')
      .map((sourceBlock) => sourceBlock.id),
  )

  for (const section of sourceResume.sections) {
    const sectionEvidence = new Set<string>()

    for (const item of section.items) {
      const itemEvidence = new Set(
        item.evidenceRefs.filter((evidenceRef) =>
          providerVisibleSourceBlockIds.has(evidenceRef),
        ),
      )

      targetEvidence.set(item.id, itemEvidence)

      for (const evidenceRef of itemEvidence) {
        sectionEvidence.add(evidenceRef)
      }
    }

    targetEvidence.set(section.id, sectionEvidence)
  }

  return targetEvidence
}

const hasSupportedEvidence = (
  evidenceRefs: readonly string[],
  targetId: string,
  targetEvidence: ReadonlyMap<string, ReadonlySet<string>>,
): boolean => {
  const supportedEvidence = targetEvidence.get(targetId)

  return (
    supportedEvidence !== undefined &&
    evidenceRefs.every((evidenceRef) => supportedEvidence.has(evidenceRef))
  )
}

const validateFindings = (
  findings: ReadonlyArray<z.infer<typeof analysisFindingSchema>>,
  targetEvidence: ReadonlyMap<string, ReadonlySet<string>>,
): void => {
  for (const finding of findings) {
    if (
      !hasSupportedEvidence(
        finding.evidenceRefs,
        finding.targetId,
        targetEvidence,
      )
    ) {
      throw createValidationError('unsupported-evidence')
    }
  }
}

export function createTailoringAnalysisRequest(
  request: unknown,
): TailoringAnalysisRequest {
  try {
    return tailoringAnalysisRequestSchema.parse(request)
  } catch (error) {
    throw createValidationError('invalid-structure', error)
  }
}

export function createTailoringAnalysisProviderInput(
  request: TailoringAnalysisRequest,
): TailoringAnalysisProviderInput {
  const providerVisibleSourceBlockIds = new Set(
    request.sourceResume.sourceBlocks
      .filter((sourceBlock) => sourceBlock.type !== 'contact')
      .map((sourceBlock) => sourceBlock.id),
  )

  return {
    jobDescription: request.jobDescription,
    sourceResume: resumeInterpretationStructuredContentSchema.parse({
      sections: request.sourceResume.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            item.evidenceRefs.every((evidenceRef) =>
              providerVisibleSourceBlockIds.has(evidenceRef),
            ),
          ),
        }))
        .filter((section) => section.items.length > 0),
      sourceBlocks: request.sourceResume.sourceBlocks.filter(
        (sourceBlock) => sourceBlock.type !== 'contact',
      ),
    }),
  }
}

export function validateTailoringAnalysis(
  analysis: unknown,
  sourceResume: ResumeInterpretationStructuredContent,
): TailoringAnalysis {
  const parsedSourceResume =
    resumeInterpretationStructuredContentSchema.parse(sourceResume)
  const parsedAnalysis = parseAnalysis(analysis)
  const targetEvidence = collectTargetEvidence(parsedSourceResume)

  validateFindings(parsedAnalysis.strengths, targetEvidence)
  validateFindings(parsedAnalysis.opportunities, targetEvidence)

  return parsedAnalysis
}
