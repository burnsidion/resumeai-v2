export type ProductDataRepositoryOperation =
  | 'read-active-base-resumes'
  | 'read-active-base-resumes-management'
  | 'read-application-summary'
  | 'read-ready-for-review'
  | 'read-recent-applications'

export class ProductDataRepositoryError extends Error {
  readonly code = 'product-data-unavailable'

  constructor(
    readonly operation: ProductDataRepositoryOperation,
    cause: unknown,
  ) {
    super('Product data could not be loaded.', { cause })
    this.name = 'ProductDataRepositoryError'
  }
}

export async function withProductDataRepositoryError<T>(
  operation: ProductDataRepositoryOperation,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof ProductDataRepositoryError) {
      throw error
    }

    throw new ProductDataRepositoryError(operation, error)
  }
}
