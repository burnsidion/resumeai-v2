import {
  baseResumesManagementDataSchema,
  type BaseResumesManagementData,
} from '../../shared/product-data/base-resumes'
import {
  createBaseResumesManagementRepository,
  type BaseResumesManagementRepository,
} from '../repositories/base-resumes'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import { ProductDataRepositoryError } from '../repositories/product-data/errors'

export interface BaseResumesProductDataServiceDependencies {
  createBaseResumesManagementRepository(
    context: ProductDataRepositoryContext,
  ): BaseResumesManagementRepository
}

const defaultDependencies: BaseResumesProductDataServiceDependencies = {
  createBaseResumesManagementRepository,
}

export class BaseResumesProductDataServiceError extends Error {
  readonly code = 'product-data-unavailable'

  constructor(cause: unknown) {
    super('Base resume product data could not be prepared.', { cause })
    this.name = 'BaseResumesProductDataServiceError'
  }
}

export async function getBaseResumesProductData(
  context: ProductDataRepositoryContext,
  dependencies: BaseResumesProductDataServiceDependencies = defaultDependencies,
): Promise<BaseResumesManagementData> {
  try {
    const repository =
      dependencies.createBaseResumesManagementRepository(context)
    const productData = await repository.getActiveForManagement()

    return baseResumesManagementDataSchema.parse(productData)
  } catch (error) {
    if (error instanceof ProductDataRepositoryError) {
      throw error
    }

    throw new BaseResumesProductDataServiceError(error)
  }
}
