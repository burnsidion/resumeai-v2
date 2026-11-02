import type { TailoringWorkingCopySummary } from '../../shared/tailoring/status'
import {
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
} from '../repositories/application-management'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import {
  createTailoringWorkingCopiesRepository,
  TailoringWorkingCopiesRepositoryError,
  type TailoringWorkingCopiesRepository,
} from '../repositories/tailoring-working-copies'

export type ApplicationWorkingCopyLifecycleErrorKind =
  | 'application-unavailable'
  | 'persistence-unavailable'
  | 'working-copy-immutable'
  | 'working-copy-unavailable'

export class ApplicationWorkingCopyLifecycleError extends Error {
  readonly code = 'working-copy-lifecycle-unavailable'

  constructor(
    readonly kind: ApplicationWorkingCopyLifecycleErrorKind,
    cause?: unknown,
  ) {
    super('The working-copy action is temporarily unavailable.', { cause })
    this.name = 'ApplicationWorkingCopyLifecycleError'
  }
}

export interface ApplicationWorkingCopyLifecycleDependencies {
  createApplicationRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationManagementRepository
  createWorkingCopiesRepository(
    context: ProductDataRepositoryContext,
  ): TailoringWorkingCopiesRepository
  now(): Date
}

const defaultDependencies: ApplicationWorkingCopyLifecycleDependencies = {
  createApplicationRepository: createApplicationManagementRepository,
  createWorkingCopiesRepository: createTailoringWorkingCopiesRepository,
  now: () => new Date(),
}

const createServiceError = (
  kind: ApplicationWorkingCopyLifecycleErrorKind,
  cause?: unknown,
): ApplicationWorkingCopyLifecycleError =>
  new ApplicationWorkingCopyLifecycleError(kind, cause)

const requireOwnedApplication = async (
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopyLifecycleDependencies,
): Promise<void> => {
  let repository: ApplicationManagementRepository

  try {
    repository = dependencies.createApplicationRepository(context)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  try {
    if ((await repository.findById(applicationId)) === null) {
      throw createServiceError('application-unavailable')
    }
  } catch (error) {
    if (error instanceof ApplicationWorkingCopyLifecycleError) {
      throw error
    }

    throw createServiceError('persistence-unavailable', error)
  }
}

const createWorkingCopiesRepository = (
  context: ProductDataRepositoryContext,
  dependencies: ApplicationWorkingCopyLifecycleDependencies,
): TailoringWorkingCopiesRepository => {
  try {
    return dependencies.createWorkingCopiesRepository(context)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }
}

const mapRepositoryError = (
  error: unknown,
): ApplicationWorkingCopyLifecycleError => {
  if (!(error instanceof TailoringWorkingCopiesRepositoryError)) {
    return createServiceError('persistence-unavailable', error)
  }

  if (error.kind === 'accepted-working-copy') {
    return createServiceError('working-copy-immutable', error)
  }

  if (error.kind === 'working-copy-unavailable') {
    return createServiceError('working-copy-unavailable', error)
  }

  return createServiceError('persistence-unavailable', error)
}

export async function acceptApplicationWorkingCopy(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopyLifecycleDependencies = defaultDependencies,
): Promise<TailoringWorkingCopySummary> {
  await requireOwnedApplication(context, applicationId, dependencies)

  let acceptedAt: string

  try {
    acceptedAt = dependencies.now().toISOString()
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  try {
    return await createWorkingCopiesRepository(
      context,
      dependencies,
    ).acceptCurrent(applicationId, acceptedAt)
  } catch (error) {
    throw mapRepositoryError(error)
  }
}

export async function discardApplicationWorkingCopy(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopyLifecycleDependencies = defaultDependencies,
): Promise<string> {
  await requireOwnedApplication(context, applicationId, dependencies)

  try {
    return await createWorkingCopiesRepository(
      context,
      dependencies,
    ).discardCurrent(applicationId)
  } catch (error) {
    throw mapRepositoryError(error)
  }
}
