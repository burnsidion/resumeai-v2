import { describe, expect, it, vi } from 'vitest'

import type { ApplicationManagementRepository } from '../../server/repositories/application-management'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import type { TailoringWorkingCopiesRepository } from '../../server/repositories/tailoring-working-copies'
import {
  acceptApplicationWorkingCopy,
  discardApplicationWorkingCopy,
  type ApplicationWorkingCopyLifecycleDependencies,
  type ApplicationWorkingCopyLifecycleError,
} from '../../server/services/application-working-copy-lifecycle'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const createDependencies = ({
  application = { id: applicationId },
  acceptCurrent = vi.fn(async () => ({
    id: workingCopyId,
    revisionNumber: 1,
    state: 'accepted' as const,
    updatedAt: '2026-11-01T00:00:00.000Z',
  })),
  discardCurrent = vi.fn(async () => workingCopyId),
}: {
  application?: { id: string } | null
  acceptCurrent?: ReturnType<typeof vi.fn>
  discardCurrent?: ReturnType<typeof vi.fn>
} = {}): {
  acceptCurrent: ReturnType<typeof vi.fn>
  dependencies: ApplicationWorkingCopyLifecycleDependencies
  discardCurrent: ReturnType<typeof vi.fn>
} => ({
  acceptCurrent,
  dependencies: {
    createApplicationRepository: () =>
      ({
        findById: async () => application,
      }) as unknown as ApplicationManagementRepository,
    createWorkingCopiesRepository: () =>
      ({
        acceptCurrent,
        discardCurrent,
      }) as unknown as TailoringWorkingCopiesRepository,
    now: () => new Date('2026-11-01T00:00:00.000Z'),
  },
  discardCurrent,
})

describe('application working-copy lifecycle service', () => {
  it('accepts only the owned current proposal with a deterministic timestamp', async () => {
    const { acceptCurrent, dependencies } = createDependencies()

    await expect(
      acceptApplicationWorkingCopy(context, applicationId, dependencies),
    ).resolves.toEqual({
      id: workingCopyId,
      revisionNumber: 1,
      state: 'accepted',
      updatedAt: '2026-11-01T00:00:00.000Z',
    })
    expect(acceptCurrent).toHaveBeenCalledWith(
      applicationId,
      '2026-11-01T00:00:00.000Z',
    )
  })

  it('discards only the owned current proposal', async () => {
    const { dependencies, discardCurrent } = createDependencies()

    await expect(
      discardApplicationWorkingCopy(context, applicationId, dependencies),
    ).resolves.toBe(workingCopyId)
    expect(discardCurrent).toHaveBeenCalledWith(applicationId)
  })

  it('does not attempt either transition when the application is unavailable', async () => {
    const { acceptCurrent, dependencies, discardCurrent } = createDependencies({
      application: null,
    })

    await expect(
      acceptApplicationWorkingCopy(context, applicationId, dependencies),
    ).rejects.toMatchObject<ApplicationWorkingCopyLifecycleError>({
      kind: 'application-unavailable',
    })
    await expect(
      discardApplicationWorkingCopy(context, applicationId, dependencies),
    ).rejects.toMatchObject<ApplicationWorkingCopyLifecycleError>({
      kind: 'application-unavailable',
    })
    expect(acceptCurrent).not.toHaveBeenCalled()
    expect(discardCurrent).not.toHaveBeenCalled()
  })
})
