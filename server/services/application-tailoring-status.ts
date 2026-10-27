import type { ApplicationManagementData } from '../../shared/applications/management'
import {
  applicationTailoringStateSchema,
  type ApplicationTailoringState,
} from '../../shared/tailoring/status'
import {
  createTailoringOperationsRepository,
  type TailoringOperationsRepository,
} from '../repositories/tailoring-operations'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import {
  createTailoringWorkingCopiesRepository,
  type TailoringWorkingCopiesRepository,
} from '../repositories/tailoring-working-copies'

export class ApplicationTailoringStatusServiceError extends Error {
  readonly code = 'application-tailoring-status-unavailable'

  constructor(cause?: unknown) {
    super('Application tailoring status is temporarily unavailable.', { cause })
    this.name = 'ApplicationTailoringStatusServiceError'
  }
}

export interface ApplicationTailoringStatusDependencies {
  createOperationsRepository(
    context: ProductDataRepositoryContext,
  ): TailoringOperationsRepository
  createWorkingCopiesRepository(
    context: ProductDataRepositoryContext,
  ): TailoringWorkingCopiesRepository
  now(): Date
}

const defaultDependencies: ApplicationTailoringStatusDependencies = {
  createOperationsRepository: createTailoringOperationsRepository,
  createWorkingCopiesRepository: createTailoringWorkingCopiesRepository,
  now: () => new Date(),
}

const createServiceError = (
  cause?: unknown,
): ApplicationTailoringStatusServiceError =>
  new ApplicationTailoringStatusServiceError(cause)

export const deriveApplicationTailoringStatus = (
  application: ApplicationManagementData,
  operation: Awaited<ReturnType<TailoringOperationsRepository['findActive']>>,
  workingCopy: Awaited<
    ReturnType<TailoringWorkingCopiesRepository['findCurrent']>
  >,
): ApplicationTailoringState => {
  if (operation !== null) {
    return applicationTailoringStateSchema.parse({ state: 'processing' })
  }

  if (workingCopy?.state === 'awaiting_review') {
    return applicationTailoringStateSchema.parse({
      state: 'working-copy-ready',
      workingCopy,
    })
  }

  if (workingCopy?.state === 'accepted') {
    return applicationTailoringStateSchema.parse({
      state: 'working-copy-accepted',
      workingCopy,
    })
  }

  return applicationTailoringStateSchema.parse({
    state: application.readiness.isReady ? 'ready' : 'not-ready',
  })
}

export async function loadApplicationTailoringStatus(
  context: ProductDataRepositoryContext,
  application: ApplicationManagementData,
  dependencies: ApplicationTailoringStatusDependencies = defaultDependencies,
): Promise<ApplicationTailoringState> {
  let operations: TailoringOperationsRepository
  let workingCopies: TailoringWorkingCopiesRepository
  let now: string

  try {
    operations = dependencies.createOperationsRepository(context)
    workingCopies = dependencies.createWorkingCopiesRepository(context)
    now = dependencies.now().toISOString()
  } catch (error) {
    throw createServiceError(error)
  }

  let operation: Awaited<
    ReturnType<TailoringOperationsRepository['findActive']>
  >
  let workingCopy: Awaited<
    ReturnType<TailoringWorkingCopiesRepository['findCurrent']>
  >

  try {
    ;[operation, workingCopy] = await Promise.all([
      operations.findActive(application.id, now),
      workingCopies.findCurrent(application.id),
    ])
  } catch (error) {
    throw createServiceError(error)
  }

  return deriveApplicationTailoringStatus(application, operation, workingCopy)
}
