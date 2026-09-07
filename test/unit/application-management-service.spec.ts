import { describe, expect, it, vi } from 'vitest'

import type { CreateApplicationRequest } from '../../shared/applications/management'
import type {
  ApplicationManagementRepository,
  ApplicationPersistenceRecord,
} from '../../server/repositories/application-management'
import type { ApplicationResumeSelectionRepository } from '../../server/repositories/application-resume-selection'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import {
  ApplicationManagementServiceError,
  createApplication,
  listApplications,
  loadApplication,
  updateApplication,
  type ApplicationManagementServiceDependencies,
} from '../../server/services/application-management'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const otherBaseResumeId = '2d1f2ca0-a46e-42df-99c9-5a362f291a46'
const createdAt = '2026-08-19T18:00:00.000Z'
const updatedAt = '2026-08-20T18:00:00.000Z'
const nextUpdatedAt = '2026-08-22T18:00:00.000Z'
const providerMessage = 'Sensitive provider implementation details'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const activeSelectedResume = {
  activeSlot: 1,
  id: baseResumeId,
  originalFilename: 'Frontend Engineering.pdf',
  retiredAt: null,
} as const

const application: ApplicationPersistenceRecord = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt,
  id: applicationId,
  jobDescription: 'Build calm, accessible product experiences.',
  notes: null,
  postingUrl: 'https://example.com/jobs/123',
  role: 'Senior Frontend Engineer',
  selectedBaseResume: activeSelectedResume,
  selectedBaseResumeId: baseResumeId,
  status: 'draft',
  updatedAt,
}

interface ServiceTestOverrides {
  applicationRepository?: Partial<ApplicationManagementRepository>
  createApplicationRepository?: ApplicationManagementServiceDependencies['createApplicationRepository']
  createResumeSelectionRepository?: ApplicationManagementServiceDependencies['createResumeSelectionRepository']
  now?: ApplicationManagementServiceDependencies['now']
  resumeSelectionRepository?: Partial<ApplicationResumeSelectionRepository>
}

const createDependencies = (
  overrides: ServiceTestOverrides = {},
): {
  applicationRepository: ApplicationManagementRepository
  dependencies: ApplicationManagementServiceDependencies
  resumeSelectionRepository: ApplicationResumeSelectionRepository
} => {
  const applicationRepository = {
    create: vi.fn(async () => application),
    findById: vi.fn(async () => application),
    list: vi.fn(async () => [application]),
    update: vi.fn(async () => application),
    ...overrides.applicationRepository,
  } satisfies ApplicationManagementRepository
  const resumeSelectionRepository = {
    findAvailableById: vi.fn(async (id: string) => ({
      activeSlot: 1,
      id,
      originalFilename: 'Frontend Engineering.pdf',
    })),
    ...overrides.resumeSelectionRepository,
  } satisfies ApplicationResumeSelectionRepository
  const dependencies = {
    createApplicationRepository: vi.fn(
      overrides.createApplicationRepository ?? (() => applicationRepository),
    ),
    createResumeSelectionRepository: vi.fn(
      overrides.createResumeSelectionRepository ??
        (() => resumeSelectionRepository),
    ),
    now: vi.fn(overrides.now ?? (() => new Date(updatedAt))),
  } satisfies ApplicationManagementServiceDependencies

  return {
    applicationRepository,
    dependencies,
    resumeSelectionRepository,
  }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  expected: {
    code: ApplicationManagementServiceError['code']
    kind: ApplicationManagementServiceError['kind']
  },
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationManagementServiceError)
    expect(error).toMatchObject(expected)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the application management service to fail.')
}

describe('create application use case', () => {
  it('creates a draft with one captured timestamp and no resume lookup when unselected', async () => {
    const input: CreateApplicationRequest = {
      company: 'Northstar Labs',
      jobDescription: null,
      notes: null,
      postingUrl: null,
      role: 'Senior Frontend Engineer',
      selectedBaseResumeId: null,
    }
    const created = {
      ...application,
      createdAt: updatedAt,
      jobDescription: null,
      postingUrl: null,
      selectedBaseResume: null,
      selectedBaseResumeId: null,
    }
    const { applicationRepository, dependencies } = createDependencies({
      applicationRepository: {
        create: vi.fn(async () => created),
      },
    })

    await expect(
      createApplication(context, input, dependencies),
    ).resolves.toMatchObject({
      id: applicationId,
      readiness: {
        isReady: false,
        missingRequirements: ['job-description', 'base-resume'],
      },
      selectedBaseResume: null,
      status: 'draft',
    })

    expect(dependencies.createApplicationRepository).toHaveBeenCalledWith(
      context,
    )
    expect(dependencies.createResumeSelectionRepository).not.toHaveBeenCalled()
    expect(dependencies.now).toHaveBeenCalledOnce()
    expect(applicationRepository.create).toHaveBeenCalledWith({
      ...input,
      createdAt: updatedAt,
      status: 'draft',
      updatedAt,
    })
  })

  it('validates an explicitly selected resume before creating a ready application', async () => {
    const input: CreateApplicationRequest = {
      company: application.company,
      jobDescription: application.jobDescription,
      notes: application.notes,
      postingUrl: application.postingUrl,
      role: application.role,
      selectedBaseResumeId: baseResumeId,
    }
    const created = { ...application, createdAt: updatedAt }
    const { applicationRepository, dependencies, resumeSelectionRepository } =
      createDependencies({
        applicationRepository: {
          create: vi.fn(async () => created),
        },
      })

    await expect(
      createApplication(context, input, dependencies),
    ).resolves.toMatchObject({
      readiness: { isReady: true, missingRequirements: [] },
      selectedBaseResume: { id: baseResumeId, isAvailable: true },
    })

    expect(dependencies.createResumeSelectionRepository).toHaveBeenCalledWith(
      context,
    )
    expect(resumeSelectionRepository.findAvailableById).toHaveBeenCalledWith(
      baseResumeId,
    )
    expect(applicationRepository.create).toHaveBeenCalledOnce()
  })

  it('rejects an unavailable selected resume before time or persistence work', async () => {
    const { applicationRepository, dependencies } = createDependencies({
      resumeSelectionRepository: {
        findAvailableById: vi.fn(async () => null),
      },
    })

    await expectServiceError(
      () =>
        createApplication(
          context,
          {
            company: application.company,
            jobDescription: application.jobDescription,
            notes: null,
            postingUrl: null,
            role: application.role,
            selectedBaseResumeId: baseResumeId,
          },
          dependencies,
        ),
      {
        code: 'selected-base-resume-unavailable',
        kind: 'selected-base-resume-unavailable',
      },
    )

    expect(dependencies.now).not.toHaveBeenCalled()
    expect(applicationRepository.create).not.toHaveBeenCalled()
  })

  it('rejects a persistence result that does not match the requested draft', async () => {
    const { dependencies } = createDependencies({
      applicationRepository: {
        create: vi.fn(async () => ({
          ...application,
          company: 'Wrong Company',
        })),
      },
    })

    await expectServiceError(
      () =>
        createApplication(
          context,
          {
            company: application.company,
            jobDescription: application.jobDescription,
            notes: application.notes,
            postingUrl: application.postingUrl,
            role: application.role,
            selectedBaseResumeId: baseResumeId,
          },
          dependencies,
        ),
      {
        code: 'application-management-unavailable',
        kind: 'inconsistent-state',
      },
    )
  })
})

describe('read application use cases', () => {
  it('maps repository order into deterministic product data', async () => {
    const incomplete = {
      ...application,
      id: '7077c821-56ad-4a0a-921f-68a1020a5652',
      jobDescription: null,
      selectedBaseResume: null,
      selectedBaseResumeId: null,
    }
    const { dependencies } = createDependencies({
      applicationRepository: {
        list: vi.fn(async () => [application, incomplete]),
      },
    })

    await expect(
      listApplications(context, dependencies),
    ).resolves.toMatchObject([
      { id: application.id, readiness: { isReady: true } },
      {
        id: incomplete.id,
        readiness: {
          isReady: false,
          missingRequirements: ['job-description', 'base-resume'],
        },
      },
    ])
  })

  it('treats zero applications as a successful list state', async () => {
    const { dependencies } = createDependencies({
      applicationRepository: { list: vi.fn(async () => []) },
    })

    await expect(listApplications(context, dependencies)).resolves.toEqual([])
  })

  it('loads an owner-visible application and derives readiness', async () => {
    const { applicationRepository, dependencies } = createDependencies()

    await expect(
      loadApplication(context, applicationId, dependencies),
    ).resolves.toMatchObject({
      id: applicationId,
      readiness: { isReady: true, missingRequirements: [] },
    })
    expect(applicationRepository.findById).toHaveBeenCalledWith(applicationId)
  })

  it('maps a missing or cross-owner application to one unavailable result', async () => {
    const { dependencies } = createDependencies({
      applicationRepository: { findById: vi.fn(async () => null) },
    })

    await expectServiceError(
      () => loadApplication(context, applicationId, dependencies),
      {
        code: 'application-unavailable',
        kind: 'application-unavailable',
      },
    )
  })
})

describe('update application use case', () => {
  it('validates a new resume selection and applies one deliberate timestamp', async () => {
    const existing = {
      ...application,
      selectedBaseResume: null,
      selectedBaseResumeId: null,
    }
    const updated = {
      ...application,
      jobDescription: 'Updated job description.',
      selectedBaseResume: {
        ...activeSelectedResume,
        id: otherBaseResumeId,
      },
      selectedBaseResumeId: otherBaseResumeId,
      updatedAt: nextUpdatedAt,
    }
    const { applicationRepository, dependencies, resumeSelectionRepository } =
      createDependencies({
        applicationRepository: {
          findById: vi.fn(async () => existing),
          update: vi.fn(async () => updated),
        },
        now: () => new Date(nextUpdatedAt),
      })

    await expect(
      updateApplication(
        context,
        applicationId,
        {
          jobDescription: 'Updated job description.',
          selectedBaseResumeId: otherBaseResumeId,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({
      readiness: { isReady: true },
      selectedBaseResume: { id: otherBaseResumeId, isAvailable: true },
      updatedAt: nextUpdatedAt,
    })

    expect(resumeSelectionRepository.findAvailableById).toHaveBeenCalledWith(
      otherBaseResumeId,
    )
    expect(dependencies.now).toHaveBeenCalledOnce()
    expect(applicationRepository.update).toHaveBeenCalledWith(applicationId, {
      jobDescription: 'Updated job description.',
      selectedBaseResumeId: otherBaseResumeId,
      updatedAt: nextUpdatedAt,
    })
  })

  it('does not revalidate an unchanged historical resume selection', async () => {
    const retiredAt = '2026-08-21T18:00:00.000Z'
    const existing = {
      ...application,
      selectedBaseResume: {
        activeSlot: null,
        id: baseResumeId,
        originalFilename: activeSelectedResume.originalFilename,
        retiredAt,
      },
      updatedAt: retiredAt,
    } satisfies ApplicationPersistenceRecord
    const updated = {
      ...existing,
      status: 'withdrawn',
      updatedAt: nextUpdatedAt,
    } satisfies ApplicationPersistenceRecord
    const { applicationRepository, dependencies } = createDependencies({
      applicationRepository: {
        findById: vi.fn(async () => existing),
        update: vi.fn(async () => updated),
      },
      now: () => new Date(nextUpdatedAt),
    })

    await expect(
      updateApplication(
        context,
        applicationId,
        { selectedBaseResumeId: baseResumeId, status: 'withdrawn' },
        dependencies,
      ),
    ).resolves.toMatchObject({
      readiness: {
        isReady: false,
        missingRequirements: ['base-resume'],
      },
      status: 'withdrawn',
    })

    expect(dependencies.createResumeSelectionRepository).not.toHaveBeenCalled()
    expect(applicationRepository.update).toHaveBeenCalledOnce()
  })

  it('allows clearing a selection without a resume lookup', async () => {
    const updated = {
      ...application,
      selectedBaseResume: null,
      selectedBaseResumeId: null,
      updatedAt: nextUpdatedAt,
    }
    const { dependencies } = createDependencies({
      applicationRepository: {
        update: vi.fn(async () => updated),
      },
      now: () => new Date(nextUpdatedAt),
    })

    await expect(
      updateApplication(
        context,
        applicationId,
        { selectedBaseResumeId: null },
        dependencies,
      ),
    ).resolves.toMatchObject({
      readiness: {
        isReady: false,
        missingRequirements: ['base-resume'],
      },
      selectedBaseResume: null,
    })
    expect(dependencies.createResumeSelectionRepository).not.toHaveBeenCalled()
  })

  it('stops before mutation when the application is unavailable', async () => {
    const { applicationRepository, dependencies } = createDependencies({
      applicationRepository: { findById: vi.fn(async () => null) },
    })

    await expectServiceError(
      () =>
        updateApplication(
          context,
          applicationId,
          { role: 'Staff Engineer' },
          dependencies,
        ),
      {
        code: 'application-unavailable',
        kind: 'application-unavailable',
      },
    )
    expect(applicationRepository.update).not.toHaveBeenCalled()
    expect(dependencies.now).not.toHaveBeenCalled()
  })

  it('maps a vanished owner-scoped update to the same unavailable result', async () => {
    const { dependencies } = createDependencies({
      applicationRepository: { update: vi.fn(async () => null) },
      now: () => new Date(nextUpdatedAt),
    })

    await expectServiceError(
      () =>
        updateApplication(
          context,
          applicationId,
          { role: 'Staff Engineer' },
          dependencies,
        ),
      {
        code: 'application-unavailable',
        kind: 'application-unavailable',
      },
    )
  })

  it('rejects an invalid clock before mutation', async () => {
    const { applicationRepository, dependencies } = createDependencies({
      now: () => new Date(Number.NaN),
    })

    await expectServiceError(
      () =>
        updateApplication(
          context,
          applicationId,
          { role: 'Staff Engineer' },
          dependencies,
        ),
      {
        code: 'application-management-unavailable',
        kind: 'unexpected-failure',
      },
    )
    expect(applicationRepository.update).not.toHaveBeenCalled()
  })
})

describe('application management failure boundaries', () => {
  it.each([
    {
      name: 'create',
      run: (dependencies: ApplicationManagementServiceDependencies) =>
        createApplication(
          context,
          {
            company: application.company,
            jobDescription: null,
            notes: null,
            postingUrl: null,
            role: application.role,
            selectedBaseResumeId: null,
          },
          dependencies,
        ),
    },
    {
      name: 'list',
      run: (dependencies: ApplicationManagementServiceDependencies) =>
        listApplications(context, dependencies),
    },
    {
      name: 'load',
      run: (dependencies: ApplicationManagementServiceDependencies) =>
        loadApplication(context, applicationId, dependencies),
    },
    {
      name: 'update',
      run: (dependencies: ApplicationManagementServiceDependencies) =>
        updateApplication(
          context,
          applicationId,
          { role: 'Staff Engineer' },
          dependencies,
        ),
    },
  ])('sanitizes $name persistence failures', async ({ name, run }) => {
    const failure = vi.fn(async () => {
      throw new Error(`${providerMessage}: ${name}`)
    })
    const { dependencies } = createDependencies({
      applicationRepository: {
        create: failure,
        findById: failure,
        list: failure,
        update: failure,
      },
      now: () => new Date(nextUpdatedAt),
    })

    await expectServiceError(() => run(dependencies), {
      code: 'application-management-unavailable',
      kind: 'persistence-unavailable',
    })
  })

  it('sanitizes resume-selection persistence failures', async () => {
    const { dependencies } = createDependencies({
      resumeSelectionRepository: {
        findAvailableById: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () =>
        createApplication(
          context,
          {
            company: application.company,
            jobDescription: application.jobDescription,
            notes: null,
            postingUrl: null,
            role: application.role,
            selectedBaseResumeId: baseResumeId,
          },
          dependencies,
        ),
      {
        code: 'application-management-unavailable',
        kind: 'persistence-unavailable',
      },
    )
  })

  it('sanitizes repository construction failures', async () => {
    const { dependencies } = createDependencies({
      createApplicationRepository: () => {
        throw new Error(providerMessage)
      },
    })

    await expectServiceError(() => listApplications(context, dependencies), {
      code: 'application-management-unavailable',
      kind: 'unexpected-failure',
    })
  })
})
