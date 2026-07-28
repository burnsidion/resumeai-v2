import {
  dashboardProductDataSchema,
  type DashboardProductData,
} from '../../shared/product-data/dashboard'
import {
  createApplicationsRepository,
  type ApplicationsRepository,
} from '../repositories/applications'
import {
  createBaseResumesRepository,
  type BaseResumesRepository,
} from '../repositories/base-resumes'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import { ProductDataRepositoryError } from '../repositories/product-data/errors'
import {
  createWorkingCopiesRepository,
  type WorkingCopiesRepository,
} from '../repositories/working-copies'

export interface DashboardProductDataServiceDependencies {
  createApplicationsRepository(
    context: ProductDataRepositoryContext,
  ): ApplicationsRepository
  createBaseResumesRepository(
    context: ProductDataRepositoryContext,
  ): BaseResumesRepository
  createWorkingCopiesRepository(
    context: ProductDataRepositoryContext,
  ): WorkingCopiesRepository
}

const defaultDependencies: DashboardProductDataServiceDependencies = {
  createApplicationsRepository,
  createBaseResumesRepository,
  createWorkingCopiesRepository,
}

export class DashboardProductDataServiceError extends Error {
  readonly code = 'product-data-unavailable'

  constructor(cause: unknown) {
    super('Dashboard product data could not be prepared.', { cause })
    this.name = 'DashboardProductDataServiceError'
  }
}

export async function getDashboardProductData(
  context: ProductDataRepositoryContext,
  dependencies: DashboardProductDataServiceDependencies = defaultDependencies,
): Promise<DashboardProductData> {
  try {
    const applicationsRepository =
      dependencies.createApplicationsRepository(context)
    const baseResumesRepository =
      dependencies.createBaseResumesRepository(context)
    const workingCopiesRepository =
      dependencies.createWorkingCopiesRepository(context)

    const [
      applicationSummary,
      recentApplications,
      baseResumes,
      readyForReview,
    ] = await Promise.all([
      applicationsRepository.getSummary(),
      applicationsRepository.listRecent(),
      baseResumesRepository.getActive(),
      workingCopiesRepository.findReadyForReview(),
    ])

    return dashboardProductDataSchema.parse({
      applicationSummary,
      baseResumes,
      readyForReview,
      recentApplications,
    })
  } catch (error) {
    if (error instanceof ProductDataRepositoryError) {
      throw error
    }

    throw new DashboardProductDataServiceError(error)
  }
}
