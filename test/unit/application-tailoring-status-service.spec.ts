import { describe, expect, it, vi } from 'vitest'

import type { ApplicationManagementData } from '../../shared/applications/management'
import type { TailoringWorkingCopySummary } from '../../shared/tailoring/status'
import type { TailoringOperationsRepository } from '../../server/repositories/tailoring-operations'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import type { TailoringWorkingCopiesRepository } from '../../server/repositories/tailoring-working-copies'
import {
  ApplicationTailoringStatusServiceError,
  loadApplicationTailoringStatus,
  type ApplicationTailoringStatusDependencies,
} from '../../server/services/application-tailoring-status'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const providerMessage = 'Sensitive persistence details'
const now = '2026-10-26T00:00:00.000Z'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const createApplication = (
  readiness: ApplicationManagementData['readiness'],
): ApplicationManagementData => ({
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-10-01T00:00:00.000Z',
  id: applicationId,
  jobDescription: readiness.isReady
    ? 'Build calm, accessible product experiences.'
    : null,
  notes: null,
  postingUrl: null,
  readiness,
  role: 'Senior Frontend Engineer',
  selectedBaseResume: null,
  status: 'draft',
  updatedAt: '2026-10-01T00:00:00.000Z',
})

const workingCopy = (
  state: TailoringWorkingCopySummary['state'],
): TailoringWorkingCopySummary => ({
  id: workingCopyId,
  revisionNumber: 2,
  state,
  updatedAt: '2026-10-25T00:00:00.000Z',
})

const createDependencies = ({
  operation = null,
  proposal = null,
}: {
  operation?: Awaited<ReturnType<TailoringOperationsRepository['findActive']>>
  proposal?: TailoringWorkingCopySummary | null
} = {}): {
  dependencies: ApplicationTailoringStatusDependencies
  findActive: ReturnType<typeof vi.fn>
  findCurrent: ReturnType<typeof vi.fn>
} => {
  const findActive = vi.fn(async () => operation)
  const findCurrent = vi.fn(async () => proposal)
  const dependencies: ApplicationTailoringStatusDependencies = {
    createOperationsRepository: () =>
      ({ findActive }) as unknown as TailoringOperationsRepository,
    createWorkingCopiesRepository: () =>
      ({ findCurrent }) as unknown as TailoringWorkingCopiesRepository,
    now: () => new Date(now),
  }

  return { dependencies, findActive, findCurrent }
}

describe('application tailoring status service', () => {
  it.each([
    {
      application: createApplication({
        isReady: false,
        missingRequirements: ['job-description', 'base-resume'],
      }),
      expected: { state: 'not-ready' },
    },
    {
      application: createApplication({
        isReady: true,
        missingRequirements: [],
      }),
      expected: { state: 'ready' },
    },
  ] as const)(
    'derives $expected.state without inventing a proposal',
    async ({ application, expected }) => {
      const { dependencies, findActive, findCurrent } = createDependencies()

      await expect(
        loadApplicationTailoringStatus(context, application, dependencies),
      ).resolves.toEqual(expected)

      expect(findActive).toHaveBeenCalledWith(applicationId, now)
      expect(findCurrent).toHaveBeenCalledWith(applicationId)
    },
  )

  it('prioritizes an active owned operation over an earlier current proposal', async () => {
    const { dependencies } = createDependencies({
      operation: {
        applicationId,
        id: 'e70f3d83-1d5e-4fc7-8740-1c2ed1f9ab53',
        leaseExpiresAt: '2026-10-26T00:02:00.000Z',
      },
      proposal: workingCopy('awaiting_review'),
    })

    await expect(
      loadApplicationTailoringStatus(
        context,
        createApplication({ isReady: true, missingRequirements: [] }),
        dependencies,
      ),
    ).resolves.toEqual({ state: 'processing' })
  })

  it.each([
    ['awaiting_review', 'working-copy-ready'],
    ['accepted', 'working-copy-accepted'],
  ] as const)(
    'exposes only safe %s working-copy metadata',
    async (workingCopyState, state) => {
      const { dependencies } = createDependencies({
        proposal: workingCopy(workingCopyState),
      })

      await expect(
        loadApplicationTailoringStatus(
          context,
          createApplication({ isReady: true, missingRequirements: [] }),
          dependencies,
        ),
      ).resolves.toEqual({
        state,
        workingCopy: workingCopy(workingCopyState),
      })
    },
  )

  it('sanitizes repository failures', async () => {
    const dependencies: ApplicationTailoringStatusDependencies = {
      createOperationsRepository: () =>
        ({
          findActive: async () => {
            throw new Error(providerMessage)
          },
        }) as unknown as TailoringOperationsRepository,
      createWorkingCopiesRepository: () =>
        ({
          findCurrent: async () => null,
        }) as unknown as TailoringWorkingCopiesRepository,
      now: () => new Date(now),
    }

    await expect(
      loadApplicationTailoringStatus(
        context,
        createApplication({ isReady: true, missingRequirements: [] }),
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ApplicationTailoringStatusServiceError)

    await expect(
      loadApplicationTailoringStatus(
        context,
        createApplication({ isReady: true, missingRequirements: [] }),
        dependencies,
      ),
    ).rejects.not.toThrow(providerMessage)
  })
})
