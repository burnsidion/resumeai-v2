import {
  applicationManagementDataSchema,
  type ApplicationManagementData,
  type CreateApplicationRequest,
  type UpdateApplicationRequest,
} from '../../shared/applications/management'
import { deriveApplicationReadiness } from '../domain/applications/readiness'
import {
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
  type ApplicationPersistenceRecord,
  type CreateApplicationRecord,
  type UpdateApplicationRecord,
} from '../repositories/application-management'
import {
  createApplicationResumeSelectionRepository,
  type ApplicationResumeSelectionRepository,
} from '../repositories/application-resume-selection'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'

export type ApplicationManagementServiceErrorKind =
  | 'application-unavailable'
  | 'inconsistent-state'
  | 'persistence-unavailable'
  | 'selected-base-resume-unavailable'
  | 'unexpected-failure'

export interface ApplicationManagementServiceDependencies {
  createApplicationRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationManagementRepository
  createResumeSelectionRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationResumeSelectionRepository
  now(): Date
}

export class ApplicationManagementServiceError extends Error {
  readonly code:
    | 'application-management-unavailable'
    | 'application-unavailable'
    | 'selected-base-resume-unavailable'

  constructor(
    readonly kind: ApplicationManagementServiceErrorKind,
    cause?: unknown,
  ) {
    const applicationUnavailable = kind === 'application-unavailable'
    const resumeUnavailable = kind === 'selected-base-resume-unavailable'

    super(
      applicationUnavailable
        ? 'The application is unavailable.'
        : resumeUnavailable
          ? 'The selected base resume is unavailable.'
          : 'Application management is temporarily unavailable.',
      { cause },
    )
    this.name = 'ApplicationManagementServiceError'
    this.code = applicationUnavailable
      ? 'application-unavailable'
      : resumeUnavailable
        ? 'selected-base-resume-unavailable'
        : 'application-management-unavailable'
  }
}

const defaultDependencies: ApplicationManagementServiceDependencies = {
  createApplicationRepository: createApplicationManagementRepository,
  createResumeSelectionRepository: createApplicationResumeSelectionRepository,
  now: () => new Date(),
}

const createServiceError = (
  kind: ApplicationManagementServiceErrorKind,
  cause?: unknown,
): ApplicationManagementServiceError =>
  new ApplicationManagementServiceError(kind, cause)

const createApplicationRepository = (
  context: ProductDataRepositoryContext,
  dependencies: ApplicationManagementServiceDependencies,
): ApplicationManagementRepository => {
  try {
    return dependencies.createApplicationRepository(context)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }
}

const getCurrentTimestamp = (
  dependencies: ApplicationManagementServiceDependencies,
): string => {
  try {
    return dependencies.now().toISOString()
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }
}

const isSelectedBaseResumeAvailable = (
  application: ApplicationPersistenceRecord,
): boolean =>
  application.selectedBaseResume !== null &&
  application.selectedBaseResume.activeSlot !== null &&
  application.selectedBaseResume.retiredAt === null

const toApplicationManagementData = (
  application: ApplicationPersistenceRecord,
): ApplicationManagementData => {
  const selectedBaseResumeAvailable = isSelectedBaseResumeAvailable(application)

  try {
    return applicationManagementDataSchema.parse({
      appliedOn: application.appliedOn,
      company: application.company,
      createdAt: application.createdAt,
      id: application.id,
      jobDescription: application.jobDescription,
      notes: application.notes,
      postingUrl: application.postingUrl,
      readiness: deriveApplicationReadiness({
        jobDescription: application.jobDescription,
        selectedBaseResumeAvailable,
      }),
      role: application.role,
      selectedBaseResume: application.selectedBaseResume
        ? {
            ...application.selectedBaseResume,
            isAvailable: selectedBaseResumeAvailable,
          }
        : null,
      status: application.status,
      updatedAt: application.updatedAt,
    })
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }
}

const requireAvailableBaseResume = async (
  context: ProductDataRepositoryContext,
  id: string,
  dependencies: ApplicationManagementServiceDependencies,
): Promise<void> => {
  let repository: ApplicationResumeSelectionRepository

  try {
    repository = dependencies.createResumeSelectionRepository(context)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  try {
    const resume = await repository.findAvailableById(id)

    if (resume === null) {
      throw createServiceError('selected-base-resume-unavailable')
    }

    if (resume.id !== id) {
      throw createServiceError('inconsistent-state')
    }
  } catch (error) {
    if (error instanceof ApplicationManagementServiceError) {
      throw error
    }

    throw createServiceError('persistence-unavailable', error)
  }
}

const requireMatchingCreatedApplication = (
  application: ApplicationPersistenceRecord,
  expected: CreateApplicationRecord,
): void => {
  if (
    application.appliedOn !== null ||
    application.company !== expected.company ||
    application.jobDescription !== expected.jobDescription ||
    application.notes !== expected.notes ||
    application.postingUrl !== expected.postingUrl ||
    application.role !== expected.role ||
    application.selectedBaseResumeId !== expected.selectedBaseResumeId ||
    application.status !== 'draft' ||
    Date.parse(application.createdAt) !== Date.parse(expected.createdAt) ||
    Date.parse(application.updatedAt) !== Date.parse(expected.updatedAt)
  ) {
    throw createServiceError('inconsistent-state')
  }
}

const requireMatchingUpdatedApplication = (
  application: ApplicationPersistenceRecord,
  expectedId: string,
  expected: UpdateApplicationRecord,
): void => {
  const mismatchedRequestedField =
    (expected.appliedOn !== undefined &&
      application.appliedOn !== expected.appliedOn) ||
    (expected.company !== undefined &&
      application.company !== expected.company) ||
    (expected.jobDescription !== undefined &&
      application.jobDescription !== expected.jobDescription) ||
    (expected.notes !== undefined && application.notes !== expected.notes) ||
    (expected.postingUrl !== undefined &&
      application.postingUrl !== expected.postingUrl) ||
    (expected.role !== undefined && application.role !== expected.role) ||
    (expected.selectedBaseResumeId !== undefined &&
      application.selectedBaseResumeId !== expected.selectedBaseResumeId) ||
    (expected.status !== undefined && application.status !== expected.status)

  if (
    application.id !== expectedId ||
    mismatchedRequestedField ||
    Date.parse(application.updatedAt) !== Date.parse(expected.updatedAt)
  ) {
    throw createServiceError('inconsistent-state')
  }
}

export async function createApplication(
  context: ProductDataRepositoryContext,
  input: CreateApplicationRequest,
  dependencies: ApplicationManagementServiceDependencies = defaultDependencies,
): Promise<ApplicationManagementData> {
  const repository = createApplicationRepository(context, dependencies)

  if (input.selectedBaseResumeId !== null) {
    await requireAvailableBaseResume(
      context,
      input.selectedBaseResumeId,
      dependencies,
    )
  }

  const timestamp = getCurrentTimestamp(dependencies)
  const record: CreateApplicationRecord = {
    ...input,
    createdAt: timestamp,
    status: 'draft',
    updatedAt: timestamp,
  }

  let application: ApplicationPersistenceRecord

  try {
    application = await repository.create(record)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  requireMatchingCreatedApplication(application, record)

  return toApplicationManagementData(application)
}

export async function listApplications(
  context: ProductDataRepositoryContext,
  dependencies: ApplicationManagementServiceDependencies = defaultDependencies,
): Promise<ReadonlyArray<ApplicationManagementData>> {
  const repository = createApplicationRepository(context, dependencies)
  let applications: ReadonlyArray<ApplicationPersistenceRecord>

  try {
    applications = await repository.list()
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  return applications.map(toApplicationManagementData)
}

export async function loadApplication(
  context: ProductDataRepositoryContext,
  id: string,
  dependencies: ApplicationManagementServiceDependencies = defaultDependencies,
): Promise<ApplicationManagementData> {
  const repository = createApplicationRepository(context, dependencies)
  let application: ApplicationPersistenceRecord | null

  try {
    application = await repository.findById(id)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (application === null) {
    throw createServiceError('application-unavailable')
  }

  return toApplicationManagementData(application)
}

export async function updateApplication(
  context: ProductDataRepositoryContext,
  id: string,
  input: UpdateApplicationRequest,
  dependencies: ApplicationManagementServiceDependencies = defaultDependencies,
): Promise<ApplicationManagementData> {
  const repository = createApplicationRepository(context, dependencies)
  let existing: ApplicationPersistenceRecord | null

  try {
    existing = await repository.findById(id)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (existing === null) {
    throw createServiceError('application-unavailable')
  }

  if (
    input.selectedBaseResumeId !== undefined &&
    input.selectedBaseResumeId !== null &&
    input.selectedBaseResumeId !== existing.selectedBaseResumeId
  ) {
    await requireAvailableBaseResume(
      context,
      input.selectedBaseResumeId,
      dependencies,
    )
  }

  const timestamp = getCurrentTimestamp(dependencies)

  if (Date.parse(timestamp) < Date.parse(existing.createdAt)) {
    throw createServiceError('unexpected-failure')
  }

  const record: UpdateApplicationRecord = {
    ...input,
    updatedAt: timestamp,
  }
  let updated: ApplicationPersistenceRecord | null

  try {
    updated = await repository.update(id, record)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (updated === null) {
    throw createServiceError('application-unavailable')
  }

  requireMatchingUpdatedApplication(updated, id, record)

  return toApplicationManagementData(updated)
}
