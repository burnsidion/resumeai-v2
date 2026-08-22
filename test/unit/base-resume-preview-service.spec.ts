import { describe, expect, it, vi } from 'vitest'

import { BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS } from '../../shared/base-resumes/preview'
import type { BaseResumePreviewStorage } from '../../server/infrastructure/supabase/base-resume-preview-storage'
import type {
  BaseResumePreviewRepository,
  BaseResumePreviewSource,
} from '../../server/repositories/base-resume-preview'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import {
  BaseResumePreviewServiceError,
  prepareBaseResumePreview,
  type BaseResumePreviewServiceDependencies,
} from '../../server/services/prepare-base-resume-preview'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const objectKey = `${userId}/${baseResumeId}.pdf`
const issuedAt = new Date('2026-08-22T05:00:00.000Z')
const expiresAt = new Date(
  issuedAt.getTime() + BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS * 1_000,
).toISOString()
const signedUrl =
  'https://example.supabase.co/storage/v1/object/sign/base-resumes/file.pdf?token=test'
const providerMessage = 'Sensitive provider implementation details'

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const source: BaseResumePreviewSource = {
  id: baseResumeId,
  originalFilename: 'Frontend Engineer.pdf',
  storageObjectKey: objectKey,
}

const createDependencies = (
  overrides: {
    createRepository?: BaseResumePreviewServiceDependencies['createRepository']
    createStorage?: BaseResumePreviewServiceDependencies['createStorage']
    now?: BaseResumePreviewServiceDependencies['now']
    repository?: Partial<BaseResumePreviewRepository>
    storage?: Partial<BaseResumePreviewStorage>
  } = {},
): {
  dependencies: BaseResumePreviewServiceDependencies
  repository: BaseResumePreviewRepository
  storage: BaseResumePreviewStorage
} => {
  const repository = {
    findActiveById: vi.fn(async () => source),
    ...overrides.repository,
  } satisfies BaseResumePreviewRepository
  const storage = {
    createSignedPreviewUrl: vi.fn(async () => signedUrl),
    ...overrides.storage,
  } satisfies BaseResumePreviewStorage
  const dependencies = {
    createRepository: vi.fn(overrides.createRepository ?? (() => repository)),
    createStorage: vi.fn(overrides.createStorage ?? (() => storage)),
    now: vi.fn(overrides.now ?? (() => issuedAt)),
  } satisfies BaseResumePreviewServiceDependencies

  return { dependencies, repository, storage }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  expected: {
    code: BaseResumePreviewServiceError['code']
    kind: BaseResumePreviewServiceError['kind']
  },
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumePreviewServiceError)
    expect(error).toMatchObject(expected)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume preview service to fail.')
}

describe('base-resume preview service', () => {
  it('coordinates owner-scoped lookup and five-minute temporary access', async () => {
    const { dependencies, repository, storage } = createDependencies()

    await expect(
      prepareBaseResumePreview(context, baseResumeId, dependencies),
    ).resolves.toEqual({
      baseResumeId,
      expiresAt,
      originalFilename: source.originalFilename,
      url: signedUrl,
    })

    expect(dependencies.createRepository).toHaveBeenCalledWith(context)
    expect(dependencies.createStorage).toHaveBeenCalledWith(context.client)
    expect(repository.findActiveById).toHaveBeenCalledWith(baseResumeId)
    expect(dependencies.now).toHaveBeenCalledOnce()
    expect(storage.createSignedPreviewUrl).toHaveBeenCalledWith(
      objectKey,
      BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
    )
  })

  it('does not create Storage access for a missing, cross-owner, or retired row', async () => {
    const { dependencies, storage } = createDependencies({
      repository: { findActiveById: vi.fn(async () => null) },
    })

    await expectServiceError(
      () => prepareBaseResumePreview(context, baseResumeId, dependencies),
      {
        code: 'base-resume-unavailable',
        kind: 'base-resume-unavailable',
      },
    )

    expect(dependencies.now).not.toHaveBeenCalled()
    expect(storage.createSignedPreviewUrl).not.toHaveBeenCalled()
  })

  it('sanitizes repository failures as recoverable persistence failures', async () => {
    const { dependencies, storage } = createDependencies({
      repository: {
        findActiveById: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => prepareBaseResumePreview(context, baseResumeId, dependencies),
      {
        code: 'base-resume-preview-unavailable',
        kind: 'persistence-unavailable',
      },
    )

    expect(storage.createSignedPreviewUrl).not.toHaveBeenCalled()
  })

  it('sanitizes Storage signing failures as recoverable access failures', async () => {
    const { dependencies } = createDependencies({
      storage: {
        createSignedPreviewUrl: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => prepareBaseResumePreview(context, baseResumeId, dependencies),
      {
        code: 'base-resume-preview-unavailable',
        kind: 'storage-unavailable',
      },
    )
  })

  it('rejects a repository result for a different resume before signing access', async () => {
    const { dependencies, storage } = createDependencies({
      repository: {
        findActiveById: vi.fn(async () => ({
          ...source,
          id: '1b89a870-0614-4b57-8574-934d629ba667',
        })),
      },
    })

    await expectServiceError(
      () => prepareBaseResumePreview(context, baseResumeId, dependencies),
      {
        code: 'base-resume-preview-unavailable',
        kind: 'inconsistent-state',
      },
    )

    expect(storage.createSignedPreviewUrl).not.toHaveBeenCalled()
  })

  it.each(['javascript:alert(1)', 'file:///private/resume.pdf'])(
    'rejects an unsafe provider URL: %s',
    async (url) => {
      const { dependencies } = createDependencies({
        storage: { createSignedPreviewUrl: vi.fn(async () => url) },
      })

      await expectServiceError(
        () => prepareBaseResumePreview(context, baseResumeId, dependencies),
        {
          code: 'base-resume-preview-unavailable',
          kind: 'inconsistent-state',
        },
      )
    },
  )

  it('sanitizes dependency-construction failures', async () => {
    const { dependencies } = createDependencies({
      createRepository: () => {
        throw new Error(providerMessage)
      },
    })

    await expectServiceError(
      () => prepareBaseResumePreview(context, baseResumeId, dependencies),
      {
        code: 'base-resume-preview-unavailable',
        kind: 'unexpected-failure',
      },
    )
  })

  it('rejects an invalid clock before creating Storage access', async () => {
    const { dependencies, storage } = createDependencies({
      now: () => new Date(Number.NaN),
    })

    await expectServiceError(
      () => prepareBaseResumePreview(context, baseResumeId, dependencies),
      {
        code: 'base-resume-preview-unavailable',
        kind: 'unexpected-failure',
      },
    )

    expect(storage.createSignedPreviewUrl).not.toHaveBeenCalled()
  })
})
