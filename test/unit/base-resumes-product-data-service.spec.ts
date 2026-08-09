import { describe, expect, it, vi } from 'vitest'

import type { BaseResumesManagementData } from '../../shared/product-data/base-resumes'
import type { BaseResumesManagementRepository } from '../../server/repositories/base-resumes'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import { ProductDataRepositoryError } from '../../server/repositories/product-data/errors'
import {
  BaseResumesProductDataServiceError,
  getBaseResumesProductData,
  type BaseResumesProductDataServiceDependencies,
} from '../../server/services/base-resumes-product-data'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId: '7bd6a80d-1a72-47b7-b55f-60a55507fd2a',
}

const productData: BaseResumesManagementData = {
  activeCount: 2,
  activeLimit: 3,
  items: [
    {
      activeSlot: 1,
      createdAt: '2026-08-08T18:00:00+00:00',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      originalFilename: 'Frontend Engineering.pdf',
      sizeBytes: 493_568,
    },
    {
      activeSlot: 2,
      createdAt: '2026-08-02T18:00:00+00:00',
      id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
      originalFilename: 'Accessibility Specialist.pdf',
      sizeBytes: 629_760,
    },
  ],
}

const createDependencies = (
  repositoryOverrides: Partial<BaseResumesManagementRepository> = {},
): {
  dependencies: BaseResumesProductDataServiceDependencies
  repository: BaseResumesManagementRepository
} => {
  const repository = {
    getActiveForManagement: vi.fn(async () => productData),
    ...repositoryOverrides,
  } satisfies BaseResumesManagementRepository
  const dependencies = {
    createBaseResumesManagementRepository: vi.fn(() => repository),
  } satisfies BaseResumesProductDataServiceDependencies

  return { dependencies, repository }
}

const expectSanitizedServiceFailure = async (
  read: () => Promise<unknown>,
  sensitiveMessage: string,
): Promise<void> => {
  try {
    await read()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumesProductDataServiceError)
    expect(error).toMatchObject({
      code: 'product-data-unavailable',
      message: 'Base resume product data could not be prepared.',
    })
    expect((error as Error).message).not.toContain(sensitiveMessage)
    expect(JSON.stringify(error)).not.toContain(sensitiveMessage)
    return
  }

  throw new Error('Expected the Base Resumes product-data service to fail.')
}

describe('Base Resumes product-data service', () => {
  it('coordinates the focused repository into the validated product contract', async () => {
    const { dependencies, repository } = createDependencies()

    await expect(
      getBaseResumesProductData(context, dependencies),
    ).resolves.toEqual(productData)

    expect(
      dependencies.createBaseResumesManagementRepository,
    ).toHaveBeenCalledOnce()
    expect(
      dependencies.createBaseResumesManagementRepository,
    ).toHaveBeenCalledWith(context)
    expect(repository.getActiveForManagement).toHaveBeenCalledOnce()
  })

  it('preserves a truthful empty state', async () => {
    const emptyState: BaseResumesManagementData = {
      activeCount: 0,
      activeLimit: 3,
      items: [],
    }
    const { dependencies } = createDependencies({
      getActiveForManagement: vi.fn(async () => emptyState),
    })

    await expect(
      getBaseResumesProductData(context, dependencies),
    ).resolves.toEqual(emptyState)
  })

  it('preserves sanitized repository failures for operation-level handling', async () => {
    const repositoryError = new ProductDataRepositoryError(
      'read-active-base-resumes-management',
      new Error('Sensitive provider details'),
    )
    const { dependencies } = createDependencies({
      getActiveForManagement: vi.fn(async () => {
        throw repositoryError
      }),
    })

    await expect(getBaseResumesProductData(context, dependencies)).rejects.toBe(
      repositoryError,
    )
  })

  it('sanitizes unexpected service and contract failures', async () => {
    const sensitiveMessage = 'Sensitive unexpected provider details'
    const { dependencies } = createDependencies({
      getActiveForManagement: vi.fn(async () => {
        throw new Error(sensitiveMessage)
      }),
    })

    await expectSanitizedServiceFailure(
      () => getBaseResumesProductData(context, dependencies),
      sensitiveMessage,
    )

    const invalidContractValue = 'invalid-contract-value'
    const { dependencies: invalidDependencies } = createDependencies({
      getActiveForManagement: vi.fn(
        async () =>
          ({
            ...productData,
            activeCount: -1,
            [invalidContractValue]: true,
          }) as unknown as BaseResumesManagementData,
      ),
    })

    await expectSanitizedServiceFailure(
      () => getBaseResumesProductData(context, invalidDependencies),
      invalidContractValue,
    )
  })
})
