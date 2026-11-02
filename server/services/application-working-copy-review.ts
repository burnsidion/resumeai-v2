import type { ApplicationWorkingCopyReview } from '../../shared/tailoring/review'
import type { ResumeInterpretationStructuredContent } from '../domain/resume-interpretations/contracts'
import {
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
} from '../repositories/application-management'
import type {
  CurrentWorkingCopyReviewRecord,
  TailoringWorkingCopiesRepository,
} from '../repositories/tailoring-working-copies'
import { createTailoringWorkingCopiesRepository } from '../repositories/tailoring-working-copies'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'

export type ApplicationWorkingCopyReviewServiceErrorKind =
  | 'application-unavailable'
  | 'inconsistent-state'
  | 'persistence-unavailable'
  | 'working-copy-unavailable'

export class ApplicationWorkingCopyReviewServiceError extends Error {
  readonly code = 'working-copy-review-unavailable'

  constructor(
    readonly kind: ApplicationWorkingCopyReviewServiceErrorKind,
    cause?: unknown,
  ) {
    super('The working-copy review is temporarily unavailable.', { cause })
    this.name = 'ApplicationWorkingCopyReviewServiceError'
  }
}

export interface ApplicationWorkingCopyReviewDependencies {
  createApplicationRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationManagementRepository
  createWorkingCopiesRepository(
    context: ProductDataRepositoryContext,
  ): TailoringWorkingCopiesRepository
}

const defaultDependencies: ApplicationWorkingCopyReviewDependencies = {
  createApplicationRepository: createApplicationManagementRepository,
  createWorkingCopiesRepository: createTailoringWorkingCopiesRepository,
}

const createServiceError = (
  kind: ApplicationWorkingCopyReviewServiceErrorKind,
  cause?: unknown,
): ApplicationWorkingCopyReviewServiceError =>
  new ApplicationWorkingCopyReviewServiceError(kind, cause)

const toDocumentSections = (
  source: ResumeInterpretationStructuredContent['sections'],
): ApplicationWorkingCopyReview['source']['sections'] =>
  source.map((section) => ({
    heading: section.heading,
    items: section.items.map((item) => item.text),
  }))

const createChangeGroups = (
  record: CurrentWorkingCopyReviewRecord,
): ApplicationWorkingCopyReview['changes'] => {
  const sectionByTargetId = new Map<string, { heading: string; id: string }>()

  for (const section of record.sourceInterpretation.structuredContent
    .sections) {
    const sectionReference = { heading: section.heading, id: section.id }
    sectionByTargetId.set(section.id, sectionReference)

    for (const item of section.items) {
      sectionByTargetId.set(item.id, sectionReference)
    }
  }

  const changesBySection = new Map<
    string,
    {
      changes: ApplicationWorkingCopyReview['changes'][number]['changes']
      sectionHeading: string
    }
  >()

  for (const change of record.changeSummary) {
    if (change.kind === 'unchanged') {
      continue
    }

    const section = sectionByTargetId.get(change.targetId)

    if (!section) {
      throw createServiceError('inconsistent-state')
    }

    const group = changesBySection.get(section.id) ?? {
      changes: [],
      sectionHeading: section.heading,
    }
    group.changes.push({ explanation: change.explanation, kind: change.kind })
    changesBySection.set(section.id, group)
  }

  return record.sourceInterpretation.structuredContent.sections.flatMap(
    (section) => {
      const group = changesBySection.get(section.id)

      return group ? [group] : []
    },
  )
}

const toReview = (
  record: CurrentWorkingCopyReviewRecord,
): ApplicationWorkingCopyReview => ({
  changes: createChangeGroups(record),
  proposal: { sections: toDocumentSections(record.proposalSections) },
  source: {
    baseResumeId: record.sourceBaseResume.id,
    filename: record.sourceBaseResume.originalFilename,
    sections: toDocumentSections(
      record.sourceInterpretation.structuredContent.sections,
    ),
  },
  workingCopy: {
    id: record.id,
    revisionNumber: record.revisionNumber,
    state: record.state,
    updatedAt: record.updatedAt,
  },
})

const loadOwnedCurrentWorkingCopyReviewRecord = async (
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopyReviewDependencies,
): Promise<CurrentWorkingCopyReviewRecord> => {
  let applicationRepository: ApplicationManagementRepository
  let workingCopiesRepository: TailoringWorkingCopiesRepository

  try {
    applicationRepository = dependencies.createApplicationRepository(context)
    workingCopiesRepository =
      dependencies.createWorkingCopiesRepository(context)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  let application: Awaited<
    ReturnType<ApplicationManagementRepository['findById']>
  >

  try {
    application = await applicationRepository.findById(applicationId)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (application === null) {
    throw createServiceError('application-unavailable')
  }

  let record: CurrentWorkingCopyReviewRecord | null

  try {
    record = await workingCopiesRepository.findCurrentReview(applicationId)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (record === null) {
    throw createServiceError('working-copy-unavailable')
  }

  if (record.applicationId !== application.id) {
    throw createServiceError('inconsistent-state')
  }

  return record
}

export async function loadApplicationWorkingCopyReview(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopyReviewDependencies = defaultDependencies,
): Promise<ApplicationWorkingCopyReview> {
  const record = await loadOwnedCurrentWorkingCopyReviewRecord(
    context,
    applicationId,
    dependencies,
  )

  try {
    return toReview(record)
  } catch (error) {
    if (error instanceof ApplicationWorkingCopyReviewServiceError) {
      throw error
    }

    throw createServiceError('inconsistent-state', error)
  }
}

export async function loadApplicationWorkingCopyReviewRecord(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopyReviewDependencies = defaultDependencies,
): Promise<CurrentWorkingCopyReviewRecord> {
  return loadOwnedCurrentWorkingCopyReviewRecord(
    context,
    applicationId,
    dependencies,
  )
}
