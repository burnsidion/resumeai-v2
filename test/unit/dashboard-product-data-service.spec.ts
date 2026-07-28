import { describe, expect, it, vi } from 'vitest'

import type {
  DashboardApplicationSummary,
  DashboardBaseResumes,
  DashboardReadyForReview,
  DashboardRecentApplication,
} from '../../shared/product-data/dashboard'
import type { ApplicationsRepository } from '../../server/repositories/applications'
import type { BaseResumesRepository } from '../../server/repositories/base-resumes'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import { ProductDataRepositoryError } from '../../server/repositories/product-data/errors'
import type { WorkingCopiesRepository } from '../../server/repositories/working-copies'
import {
  DashboardProductDataServiceError,
  getDashboardProductData,
  type DashboardProductDataServiceDependencies,
} from '../../server/services/dashboard-product-data'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId: '7bd6a80d-1a72-47b7-b55f-60a55507fd2a',
}

const applicationSummary: DashboardApplicationSummary = {
  activeCount: 4,
  interviewCount: 1,
}

const recentApplications: ReadonlyArray<DashboardRecentApplication> = [
  {
    appliedOn: '2026-07-22',
    company: 'Lantern Health',
    createdAt: '2026-07-20T18:00:00+00:00',
    id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
    role: 'Product Engineer',
    status: 'applied',
    updatedAt: '2026-07-22T18:00:00+00:00',
  },
]

const baseResumes: DashboardBaseResumes = {
  activeCount: 1,
  activeLimit: 3,
  items: [
    {
      activeSlot: 1,
      createdAt: '2026-07-20T18:00:00+00:00',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      originalFilename: 'Frontend Engineering.pdf',
    },
  ],
}

const readyForReview: DashboardReadyForReview = {
  applicationId: 'dd87d5fd-ad50-46da-b07f-b5470e03aca7',
  company: 'Northstar Labs',
  role: 'Senior Frontend Engineer',
  state: 'awaiting_review',
  updatedAt: '2026-07-27T18:00:00+00:00',
  workingCopyId: '4ee6178a-a5b7-4f0a-8ff9-9b04756846a8',
}

const createDependencies = (
  overrides: {
    applications?: Partial<ApplicationsRepository>
    baseResumes?: Partial<BaseResumesRepository>
    workingCopies?: Partial<WorkingCopiesRepository>
  } = {},
): {
  dependencies: DashboardProductDataServiceDependencies
  repositories: {
    applications: ApplicationsRepository
    baseResumes: BaseResumesRepository
    workingCopies: WorkingCopiesRepository
  }
} => {
  const repositories = {
    applications: {
      getSummary: vi.fn(async () => applicationSummary),
      listRecent: vi.fn(async () => recentApplications),
      ...overrides.applications,
    },
    baseResumes: {
      getActive: vi.fn(async () => baseResumes),
      ...overrides.baseResumes,
    },
    workingCopies: {
      findReadyForReview: vi.fn(async () => readyForReview),
      ...overrides.workingCopies,
    },
  } satisfies {
    applications: ApplicationsRepository
    baseResumes: BaseResumesRepository
    workingCopies: WorkingCopiesRepository
  }

  return {
    dependencies: {
      createApplicationsRepository: vi.fn(() => repositories.applications),
      createBaseResumesRepository: vi.fn(() => repositories.baseResumes),
      createWorkingCopiesRepository: vi.fn(() => repositories.workingCopies),
    },
    repositories,
  }
}

const expectSanitizedServiceFailure = async (
  read: () => Promise<unknown>,
  sensitiveMessage: string,
): Promise<void> => {
  try {
    await read()
  } catch (error) {
    expect(error).toBeInstanceOf(DashboardProductDataServiceError)
    expect(error).toMatchObject({
      code: 'product-data-unavailable',
      message: 'Dashboard product data could not be prepared.',
    })
    expect((error as Error).message).not.toContain(sensitiveMessage)
    expect(JSON.stringify(error)).not.toContain(sensitiveMessage)
    return
  }

  throw new Error('Expected the dashboard product-data service to fail.')
}

describe('dashboard product-data service', () => {
  it('coordinates the focused repositories into the safe dashboard contract', async () => {
    const { dependencies, repositories } = createDependencies()

    await expect(
      getDashboardProductData(context, dependencies),
    ).resolves.toEqual({
      applicationSummary,
      baseResumes,
      readyForReview,
      recentApplications,
    })

    expect(dependencies.createApplicationsRepository).toHaveBeenCalledOnce()
    expect(dependencies.createApplicationsRepository).toHaveBeenCalledWith(
      context,
    )
    expect(dependencies.createBaseResumesRepository).toHaveBeenCalledOnce()
    expect(dependencies.createBaseResumesRepository).toHaveBeenCalledWith(
      context,
    )
    expect(dependencies.createWorkingCopiesRepository).toHaveBeenCalledOnce()
    expect(dependencies.createWorkingCopiesRepository).toHaveBeenCalledWith(
      context,
    )
    expect(repositories.applications.getSummary).toHaveBeenCalledOnce()
    expect(repositories.applications.listRecent).toHaveBeenCalledOnce()
    expect(repositories.baseResumes.getActive).toHaveBeenCalledOnce()
    expect(repositories.workingCopies.findReadyForReview).toHaveBeenCalledOnce()
  })

  it('preserves truthful empty dashboard state', async () => {
    const { dependencies } = createDependencies({
      applications: {
        getSummary: vi.fn(async () => ({
          activeCount: 0,
          interviewCount: 0,
        })),
        listRecent: vi.fn(async () => []),
      },
      baseResumes: {
        getActive: vi.fn(async () => ({
          activeCount: 0,
          activeLimit: 3,
          items: [],
        })),
      },
      workingCopies: {
        findReadyForReview: vi.fn(async () => null),
      },
    })

    await expect(
      getDashboardProductData(context, dependencies),
    ).resolves.toEqual({
      applicationSummary: {
        activeCount: 0,
        interviewCount: 0,
      },
      baseResumes: {
        activeCount: 0,
        activeLimit: 3,
        items: [],
      },
      readyForReview: null,
      recentApplications: [],
    })
  })

  it('preserves a sanitized repository failure for operation-level handling', async () => {
    const repositoryError = new ProductDataRepositoryError(
      'read-recent-applications',
      new Error('Sensitive provider details'),
    )
    const { dependencies } = createDependencies({
      applications: {
        listRecent: vi.fn(async () => {
          throw repositoryError
        }),
      },
    })

    await expect(getDashboardProductData(context, dependencies)).rejects.toBe(
      repositoryError,
    )
  })

  it('sanitizes unexpected orchestration and contract failures', async () => {
    const providerMessage = 'Sensitive unexpected provider details'
    const { dependencies } = createDependencies({
      applications: {
        getSummary: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectSanitizedServiceFailure(
      () => getDashboardProductData(context, dependencies),
      providerMessage,
    )
  })

  it('rejects invalid combined data at the service boundary', async () => {
    const invalidContractMessage = 'invalid-count-contract'
    const { dependencies } = createDependencies({
      applications: {
        getSummary: vi.fn(
          async () =>
            ({
              activeCount: -1,
              interviewCount: 0,
              [invalidContractMessage]: true,
            }) as unknown as DashboardApplicationSummary,
        ),
      },
    })

    await expectSanitizedServiceFailure(
      () => getDashboardProductData(context, dependencies),
      invalidContractMessage,
    )
  })
})
