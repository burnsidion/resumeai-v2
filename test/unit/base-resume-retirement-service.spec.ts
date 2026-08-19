import { describe, expect, it, vi } from 'vitest'

import {
  BaseResumeRetirementRepositoryError,
  type BaseResumeRetirementRepository,
} from '../../server/repositories/base-resume-retirement'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import {
  BaseResumeRetirementServiceError,
  retireBaseResume,
  type BaseResumeRetirementServiceDependencies,
} from '../../server/services/retire-base-resume'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const retirementTime = new Date('2026-08-19T04:30:00.000Z')
const retiredAt = retirementTime.toISOString()
const providerMessage = 'Sensitive provider implementation details'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const createDependencies = (
  overrides: {
    createRepository?: BaseResumeRetirementServiceDependencies['createRepository']
    now?: BaseResumeRetirementServiceDependencies['now']
    repository?: Partial<BaseResumeRetirementRepository>
  } = {},
): {
  dependencies: BaseResumeRetirementServiceDependencies
  repository: BaseResumeRetirementRepository
} => {
  const repository = {
    findLifecycleById: vi.fn(async () => null),
    retire: vi.fn(async (id: string, timestamp: string) => ({
      id,
      retiredAt: timestamp,
    })),
    ...overrides.repository,
  } satisfies BaseResumeRetirementRepository
  const dependencies = {
    createRepository: vi.fn(overrides.createRepository ?? (() => repository)),
    now: vi.fn(overrides.now ?? (() => retirementTime)),
  } satisfies BaseResumeRetirementServiceDependencies

  return { dependencies, repository }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  expected: {
    code: BaseResumeRetirementServiceError['code']
    kind: BaseResumeRetirementServiceError['kind']
  },
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumeRetirementServiceError)
    expect(error).toMatchObject(expected)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume retirement service to fail.')
}

describe('base-resume retirement service', () => {
  it('captures time once and coordinates one retirement attempt', async () => {
    const { dependencies, repository } = createDependencies()

    await expect(
      retireBaseResume(context, baseResumeId, dependencies),
    ).resolves.toEqual({ id: baseResumeId, retiredAt })

    expect(dependencies.createRepository).toHaveBeenCalledOnce()
    expect(dependencies.createRepository).toHaveBeenCalledWith(context)
    expect(dependencies.now).toHaveBeenCalledOnce()
    expect(repository.retire).toHaveBeenCalledOnce()
    expect(repository.retire).toHaveBeenCalledWith(baseResumeId, retiredAt)
    expect(repository.findLifecycleById).not.toHaveBeenCalled()
  })

  it('returns the original timestamp when the resume was already retired', async () => {
    const originalRetiredAt = '2026-08-18T03:00:00.000Z'
    const { dependencies, repository } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => ({
          activeSlot: null,
          id: baseResumeId,
          retiredAt: originalRetiredAt,
          state: 'retired',
        })),
        retire: vi.fn(async () => null),
      },
    })

    await expect(
      retireBaseResume(context, baseResumeId, dependencies),
    ).resolves.toEqual({ id: baseResumeId, retiredAt: originalRetiredAt })

    expect(repository.findLifecycleById).toHaveBeenCalledWith(baseResumeId)
  })

  it('maps a missing or cross-owner resume to the same unavailable result', async () => {
    const { dependencies } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => null),
        retire: vi.fn(async () => null),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-unavailable',
        kind: 'base-resume-unavailable',
      },
    )
  })

  it('recognizes a committed retirement after an ambiguous provider failure', async () => {
    const repositoryFailure = new BaseResumeRetirementRepositoryError(
      'retire-base-resume',
      'provider-failure',
      new Error(providerMessage),
    )
    const { dependencies, repository } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => ({
          activeSlot: null,
          id: baseResumeId,
          retiredAt,
          state: 'retired',
        })),
        retire: vi.fn(async () => {
          throw repositoryFailure
        }),
      },
    })

    await expect(
      retireBaseResume(context, baseResumeId, dependencies),
    ).resolves.toEqual({ id: baseResumeId, retiredAt })

    expect(repository.findLifecycleById).toHaveBeenCalledWith(baseResumeId)
  })

  it('reports persistence unavailable when a failed retirement remains active', async () => {
    const { dependencies } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => ({
          activeSlot: 2,
          id: baseResumeId,
          retiredAt: null,
          state: 'active',
        })),
        retire: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'persistence-unavailable',
      },
    )
  })

  it('does not turn a provider failure with no visible row into a false 404', async () => {
    const { dependencies } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => null),
        retire: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'persistence-unavailable',
      },
    )
  })

  it('sanitizes reconciliation failures', async () => {
    const { dependencies } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        retire: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'persistence-unavailable',
      },
    )
  })

  it('rejects a clean no-row mutation when the row still appears active', async () => {
    const { dependencies } = createDependencies({
      repository: {
        findLifecycleById: vi.fn(async () => ({
          activeSlot: 2,
          id: baseResumeId,
          retiredAt: null,
          state: 'active',
        })),
        retire: vi.fn(async () => null),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'inconsistent-state',
      },
    )
  })

  it('rejects a successful result for a different resume', async () => {
    const { dependencies } = createDependencies({
      repository: {
        retire: vi.fn(async () => ({
          id: '1b89a870-0614-4b57-8574-934d629ba667',
          retiredAt,
        })),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'inconsistent-state',
      },
    )
  })

  it('rejects a successful result with a different retirement instant', async () => {
    const { dependencies } = createDependencies({
      repository: {
        retire: vi.fn(async () => ({
          id: baseResumeId,
          retiredAt: '2026-08-19T04:31:00.000Z',
        })),
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'inconsistent-state',
      },
    )
  })

  it('sanitizes repository construction failures', async () => {
    const { dependencies } = createDependencies({
      createRepository: () => {
        throw new Error(providerMessage)
      },
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'unexpected-failure',
      },
    )
  })

  it('sanitizes an invalid clock result before attempting retirement', async () => {
    const { dependencies, repository } = createDependencies({
      now: () => new Date(Number.NaN),
    })

    await expectServiceError(
      () => retireBaseResume(context, baseResumeId, dependencies),
      {
        code: 'base-resume-retirement-unavailable',
        kind: 'unexpected-failure',
      },
    )

    expect(repository.retire).not.toHaveBeenCalled()
  })
})
