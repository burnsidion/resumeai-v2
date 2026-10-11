import { z } from 'zod'

import { calculateResumeSourceSha256 } from '../resume-interpretations/interpret'
import {
  resumeInterpretationStructuredContentSchema,
  resumeLogicalSectionSchema,
  type ResumeInterpretationStructuredContent,
} from '../resume-interpretations/contracts'
import { tailoringAnalysisSchema, type TailoringAnalysis } from './analysis'

const stableIdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]*$/u)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)

const workingCopyChangeKinds = [
  'omitted',
  'reordered',
  'rewritten',
  'unchanged',
] as const

const workingCopyChangeSchema = z
  .object({
    evidenceRefs: z.array(stableIdentifierSchema).min(1),
    explanation: z.string().trim().min(1),
    kind: z.enum(workingCopyChangeKinds),
    targetId: stableIdentifierSchema,
  })
  .strict()

export const tailoringWorkingCopyProposalSchema = z
  .object({
    changeSummary: z.array(workingCopyChangeSchema),
    sections: z.array(resumeLogicalSectionSchema).min(1),
  })
  .strict()

export const tailoringWorkingCopyRequestSchema = z
  .object({
    analysis: tailoringAnalysisSchema,
    jobDescription: z.string().trim().min(1),
    sourceResume: resumeInterpretationStructuredContentSchema,
  })
  .strict()

export const tailoringWorkingCopyProvenanceSchema = z
  .object({
    modelName: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
    providerName: z.string().trim().min(1),
    sourceInterpretationSha256: sha256Schema,
    sourceResumeSha256: sha256Schema,
  })
  .strict()

export type TailoringWorkingCopyProposal = z.infer<
  typeof tailoringWorkingCopyProposalSchema
>
export type TailoringWorkingCopyRequest = z.infer<
  typeof tailoringWorkingCopyRequestSchema
>
export type TailoringWorkingCopyProvenance = z.infer<
  typeof tailoringWorkingCopyProvenanceSchema
>

export interface TailoringWorkingCopyProviderInput {
  analysis: TailoringAnalysis
  jobDescription: string
  sourceResume: ResumeInterpretationStructuredContent
}

export interface TailoringWorkingCopyProvider {
  propose(
    request: TailoringWorkingCopyRequest,
  ): Promise<TailoringWorkingCopyProposal>
}

export type TailoringWorkingCopyValidationErrorKind =
  | 'invalid-structure'
  | 'invalid-summary'
  | 'invalid-structure-change'
  | 'unsupported-evidence'

export class TailoringWorkingCopyValidationError extends Error {
  readonly code = 'tailoring-working-copy-invalid'

  constructor(
    readonly kind: TailoringWorkingCopyValidationErrorKind,
    cause?: unknown,
  ) {
    super('The tailoring working copy could not be validated.', { cause })
    this.name = 'TailoringWorkingCopyValidationError'
  }
}

const createValidationError = (
  kind: TailoringWorkingCopyValidationErrorKind,
  cause?: unknown,
): TailoringWorkingCopyValidationError =>
  new TailoringWorkingCopyValidationError(kind, cause)

const getProviderVisibleSourceBlockIds = (
  sourceResume: ResumeInterpretationStructuredContent,
): Set<string> =>
  new Set(
    sourceResume.sourceBlocks
      .filter((sourceBlock) => sourceBlock.type !== 'contact')
      .map((sourceBlock) => sourceBlock.id),
  )

const collectTargetEvidence = (
  sourceResume: ResumeInterpretationStructuredContent,
  providerVisibleSourceBlockIds: ReadonlySet<string>,
): Map<string, Set<string>> => {
  const targetEvidence = new Map<string, Set<string>>()

  for (const section of sourceResume.sections) {
    const sectionEvidence = new Set<string>()

    for (const item of section.items) {
      const itemEvidence = new Set(
        item.evidenceRefs.filter((evidenceRef) =>
          providerVisibleSourceBlockIds.has(evidenceRef),
        ),
      )

      targetEvidence.set(item.id, itemEvidence)
      itemEvidence.forEach((evidenceRef) => sectionEvidence.add(evidenceRef))
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

const sameSequence = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const validateSections = (
  proposal: TailoringWorkingCopyProposal,
  sourceResume: ResumeInterpretationStructuredContent,
  targetEvidence: ReadonlyMap<string, ReadonlySet<string>>,
): void => {
  if (proposal.sections.length !== sourceResume.sections.length) {
    throw createValidationError('invalid-structure-change')
  }

  const proposedItemIds = new Set<string>()

  for (const [sectionIndex, proposedSection] of proposal.sections.entries()) {
    const sourceSection = sourceResume.sections[sectionIndex]

    if (
      sourceSection === undefined ||
      proposedSection.id !== sourceSection.id ||
      proposedSection.heading !== sourceSection.heading ||
      proposedSection.kind !== sourceSection.kind
    ) {
      throw createValidationError('invalid-structure-change')
    }

    const sourceItems = new Map(
      sourceSection.items.map((item) => [item.id, item]),
    )

    for (const proposedItem of proposedSection.items) {
      const sourceItem = sourceItems.get(proposedItem.id)

      if (sourceItem === undefined || proposedItemIds.has(proposedItem.id)) {
        throw createValidationError('invalid-structure-change')
      }

      proposedItemIds.add(proposedItem.id)

      if (
        !hasSupportedEvidence(
          proposedItem.evidenceRefs,
          proposedItem.id,
          targetEvidence,
        )
      ) {
        throw createValidationError('unsupported-evidence')
      }
    }
  }
}

const validateChangeSummary = (
  proposal: TailoringWorkingCopyProposal,
  sourceResume: ResumeInterpretationStructuredContent,
  targetEvidence: ReadonlyMap<string, ReadonlySet<string>>,
): void => {
  const sourceItems = new Map(
    sourceResume.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  )
  const proposedItems = new Map(
    proposal.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  )
  const summaryByTargetAndKind = new Set<string>()

  for (const change of proposal.changeSummary) {
    const summaryKey = `${change.kind}:${change.targetId}`

    if (summaryByTargetAndKind.has(summaryKey)) {
      throw createValidationError('invalid-summary')
    }

    summaryByTargetAndKind.add(summaryKey)

    if (
      !hasSupportedEvidence(
        change.evidenceRefs,
        change.targetId,
        targetEvidence,
      )
    ) {
      throw createValidationError('unsupported-evidence')
    }

    const sourceItem = sourceItems.get(change.targetId)
    const proposedItem = proposedItems.get(change.targetId)
    const sourceSection = sourceResume.sections.find(
      (section) => section.id === change.targetId,
    )

    if (change.kind === 'reordered') {
      if (sourceSection === undefined) {
        throw createValidationError('invalid-summary')
      }

      continue
    }

    if (sourceItem === undefined) {
      throw createValidationError('invalid-summary')
    }

    if (change.kind === 'omitted' && proposedItem !== undefined) {
      throw createValidationError('invalid-summary')
    }

    if (
      change.kind === 'rewritten' &&
      (proposedItem === undefined ||
        (proposedItem.text === sourceItem.text &&
          sameSequence(proposedItem.evidenceRefs, sourceItem.evidenceRefs)))
    ) {
      throw createValidationError('invalid-summary')
    }

    if (
      change.kind === 'unchanged' &&
      (proposedItem === undefined ||
        proposedItem.text !== sourceItem.text ||
        !sameSequence(proposedItem.evidenceRefs, sourceItem.evidenceRefs))
    ) {
      throw createValidationError('invalid-summary')
    }
  }

  for (const [itemId, sourceItem] of sourceItems) {
    const proposedItem = proposedItems.get(itemId)

    if (proposedItem === undefined) {
      if (!summaryByTargetAndKind.has(`omitted:${itemId}`)) {
        throw createValidationError('invalid-summary')
      }

      continue
    }

    if (
      (proposedItem.text !== sourceItem.text ||
        !sameSequence(proposedItem.evidenceRefs, sourceItem.evidenceRefs)) &&
      !summaryByTargetAndKind.has(`rewritten:${itemId}`)
    ) {
      throw createValidationError('invalid-summary')
    }
  }

  for (const [sectionIndex, sourceSection] of sourceResume.sections.entries()) {
    const proposedSection = proposal.sections[sectionIndex]

    if (proposedSection === undefined) {
      throw createValidationError('invalid-structure-change')
    }

    const originalOrder = sourceSection.items
      .filter((item) => proposedSection.items.some(({ id }) => id === item.id))
      .map((item) => item.id)
    const proposedOrder = proposedSection.items.map((item) => item.id)

    if (
      !sameSequence(originalOrder, proposedOrder) &&
      !summaryByTargetAndKind.has(`reordered:${sourceSection.id}`)
    ) {
      throw createValidationError('invalid-summary')
    }
  }
}

export function createTailoringWorkingCopyRequest(
  request: unknown,
): TailoringWorkingCopyRequest {
  try {
    return tailoringWorkingCopyRequestSchema.parse(request)
  } catch (error) {
    throw createValidationError('invalid-structure', error)
  }
}

export function createTailoringWorkingCopyProviderInput(
  request: TailoringWorkingCopyRequest,
): TailoringWorkingCopyProviderInput {
  const providerVisibleSourceBlockIds = getProviderVisibleSourceBlockIds(
    request.sourceResume,
  )

  return {
    analysis: request.analysis,
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

export function validateTailoringWorkingCopy(
  proposal: unknown,
  sourceResume: ResumeInterpretationStructuredContent,
): TailoringWorkingCopyProposal {
  let parsedSourceResume: ResumeInterpretationStructuredContent
  let parsedProposal: TailoringWorkingCopyProposal

  try {
    parsedSourceResume =
      resumeInterpretationStructuredContentSchema.parse(sourceResume)
    parsedProposal = tailoringWorkingCopyProposalSchema.parse(proposal)
  } catch (error) {
    throw createValidationError('invalid-structure', error)
  }

  const targetEvidence = collectTargetEvidence(
    parsedSourceResume,
    getProviderVisibleSourceBlockIds(parsedSourceResume),
  )

  validateSections(parsedProposal, parsedSourceResume, targetEvidence)
  validateChangeSummary(parsedProposal, parsedSourceResume, targetEvidence)

  return parsedProposal
}

export async function calculateTailoringWorkingCopySha256(
  proposal: TailoringWorkingCopyProposal,
): Promise<string> {
  const parsedProposal = tailoringWorkingCopyProposalSchema.parse(proposal)
  const serialized = JSON.stringify({
    changeSummary: parsedProposal.changeSummary.map((change) => ({
      evidenceRefs: change.evidenceRefs,
      explanation: change.explanation,
      kind: change.kind,
      targetId: change.targetId,
    })),
    sections: parsedProposal.sections.map((section) => ({
      heading: section.heading,
      id: section.id,
      items: section.items.map((item) => ({
        evidenceRefs: item.evidenceRefs,
        id: item.id,
        text: item.text,
      })),
      kind: section.kind,
    })),
  })

  return calculateResumeSourceSha256(new TextEncoder().encode(serialized))
}
