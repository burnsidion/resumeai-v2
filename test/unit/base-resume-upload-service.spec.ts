import { describe, expect, it, vi } from 'vitest'

import type { BaseResumeUploadDomainError } from '../../server/domain/base-resumes/upload'
import type { BaseResumeStorage } from '../../server/infrastructure/supabase/base-resume-storage'
import {
  BaseResumeUploadRepositoryError,
  type BaseResumeUploadRepository,
  type CreateBaseResumeRecord,
  type PersistedBaseResume,
} from '../../server/repositories/base-resume-uploads'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import {
  BaseResumeUploadServiceError,
  uploadBaseResume,
  type BaseResumeUploadServiceDependencies,
} from '../../server/services/upload-base-resume'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const contentSha256 = 'a'.repeat(64)
const providerMessage = 'Sensitive provider implementation details'
const bytes = new TextEncoder().encode('%PDF-1.7\nResumAI\n%%EOF')
const objectKey = `${userId}/${baseResumeId}.pdf`

const context: ProductDataRepositoryContext = {
  client: {} as ProductDataRepositoryContext['client'],
  userId,
}

const candidate = {
  bytes,
  contentType: 'application/pdf',
  originalFilename: '  Frontend Engineer.pdf  ',
}

const toPersistedResume = (
  record: CreateBaseResumeRecord,
): PersistedBaseResume => ({
  ...record,
  contentType: 'application/pdf',
  createdAt: '2026-08-05T06:15:00+00:00',
  retiredAt: null,
})

const createDependencies = (
  overrides: {
    calculateSha256?: BaseResumeUploadServiceDependencies['calculateSha256']
    createId?: BaseResumeUploadServiceDependencies['createId']
    repository?: Partial<BaseResumeUploadRepository>
    storage?: Partial<BaseResumeStorage>
  } = {},
): {
  dependencies: BaseResumeUploadServiceDependencies
  repository: BaseResumeUploadRepository
  storage: BaseResumeStorage
} => {
  const repository = {
    create: vi.fn(async (record: CreateBaseResumeRecord) =>
      toPersistedResume(record),
    ),
    findById: vi.fn(async () => null),
    listActiveSlots: vi.fn(async () => []),
    ...overrides.repository,
  } satisfies BaseResumeUploadRepository
  const storage = {
    objectExists: vi.fn(async () => false),
    removeUntrackedObject: vi.fn(async () => 'removed' as const),
    uploadImmutableObject: vi.fn(async () => undefined),
    ...overrides.storage,
  } satisfies BaseResumeStorage
  const dependencies = {
    calculateSha256: vi.fn(
      overrides.calculateSha256 ?? (async () => contentSha256),
    ),
    createId: vi.fn(overrides.createId ?? (() => baseResumeId)),
    createRepository: vi.fn(() => repository),
    createStorage: vi.fn(() => storage),
  } satisfies BaseResumeUploadServiceDependencies

  return { dependencies, repository, storage }
}

const expectServiceError = async (
  action: () => Promise<unknown>,
  expected: {
    code: 'active-resume-limit-reached' | 'base-resume-upload-unavailable'
    kind: BaseResumeUploadServiceError['kind']
  },
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumeUploadServiceError)
    expect(error).toMatchObject(expected)
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume upload service to fail.')
}

describe('base-resume upload service', () => {
  it('coordinates validation, identity, hashing, upload, and persistence once', async () => {
    const { dependencies, repository, storage } = createDependencies()

    await expect(
      uploadBaseResume(context, candidate, dependencies),
    ).resolves.toEqual({
      activeSlot: 1,
      createdAt: '2026-08-05T06:15:00+00:00',
      id: baseResumeId,
      originalFilename: 'Frontend Engineer.pdf',
    })

    expect(dependencies.createRepository).toHaveBeenCalledWith(context)
    expect(dependencies.createStorage).toHaveBeenCalledWith(context.client)
    expect(repository.listActiveSlots).toHaveBeenCalledOnce()
    expect(dependencies.calculateSha256).toHaveBeenCalledWith(bytes)
    expect(storage.uploadImmutableObject).toHaveBeenCalledWith({
      bytes,
      objectKey,
    })
    expect(repository.create).toHaveBeenCalledWith({
      activeSlot: 1,
      contentSha256,
      id: baseResumeId,
      originalFilename: 'Frontend Engineer.pdf',
      sizeBytes: bytes.byteLength,
      storageObjectKey: objectKey,
    })
    expect(storage.removeUntrackedObject).not.toHaveBeenCalled()

    expect(
      vi.mocked(repository.listActiveSlots).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(dependencies.calculateSha256).mock.invocationCallOrder[0] ?? 0,
    )
    expect(
      vi.mocked(dependencies.calculateSha256).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(storage.uploadImmutableObject).mock.invocationCallOrder[0] ?? 0,
    )
    expect(
      vi.mocked(storage.uploadImmutableObject).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(repository.create).mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('rejects invalid content before creating provider boundaries', async () => {
    const { dependencies } = createDependencies()

    await expect(
      uploadBaseResume(
        context,
        { ...candidate, contentType: 'text/plain' },
        dependencies,
      ),
    ).rejects.toMatchObject<BaseResumeUploadDomainError>({
      code: 'unsupported-file-type',
    })

    expect(dependencies.createRepository).not.toHaveBeenCalled()
    expect(dependencies.createStorage).not.toHaveBeenCalled()
  })

  it('rejects the fourth active resume before identity or provider writes', async () => {
    const { dependencies, repository, storage } = createDependencies({
      repository: {
        listActiveSlots: vi.fn(async () => [1, 2, 3]),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'active-resume-limit-reached',
        kind: 'active-resume-limit-reached',
      },
    )

    expect(dependencies.createId).not.toHaveBeenCalled()
    expect(dependencies.calculateSha256).not.toHaveBeenCalled()
    expect(storage.uploadImmutableObject).not.toHaveBeenCalled()
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('fills the lowest available active slot', async () => {
    const { dependencies, repository } = createDependencies({
      repository: {
        listActiveSlots: vi.fn(async () => [1, 3]),
      },
    })

    await uploadBaseResume(context, candidate, dependencies)

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ activeSlot: 2 }),
    )
  })

  it('retries only the row with the next deterministic slot after a conflict', async () => {
    const conflict = new BaseResumeUploadRepositoryError(
      'create-base-resume',
      'active-slot-conflict',
      new Error(providerMessage),
    )
    const { dependencies, repository, storage } = createDependencies({
      repository: {
        create: vi
          .fn<BaseResumeUploadRepository['create']>()
          .mockRejectedValueOnce(conflict)
          .mockImplementation(async (record) => toPersistedResume(record)),
        listActiveSlots: vi
          .fn<BaseResumeUploadRepository['listActiveSlots']>()
          .mockResolvedValueOnce([1])
          .mockResolvedValueOnce([1, 2]),
      },
    })

    await expect(
      uploadBaseResume(context, candidate, dependencies),
    ).resolves.toMatchObject({ activeSlot: 3 })

    expect(repository.create).toHaveBeenCalledTimes(2)
    expect(repository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ activeSlot: 2 }),
    )
    expect(repository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ activeSlot: 3 }),
    )
    expect(storage.uploadImmutableObject).toHaveBeenCalledOnce()
  })

  it('cleans the object if concurrent requests fill every slot', async () => {
    const conflict = new BaseResumeUploadRepositoryError(
      'create-base-resume',
      'active-slot-conflict',
      new Error(providerMessage),
    )
    const { dependencies, repository, storage } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw conflict
        }),
        listActiveSlots: vi
          .fn<BaseResumeUploadRepository['listActiveSlots']>()
          .mockResolvedValueOnce([1, 2])
          .mockResolvedValueOnce([1, 2, 3]),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'active-resume-limit-reached',
        kind: 'active-resume-limit-reached',
      },
    )

    expect(repository.create).toHaveBeenCalledOnce()
    expect(storage.removeUntrackedObject).toHaveBeenCalledWith(objectKey)
  })

  it('recognizes a committed matching row after an ambiguous insert error', async () => {
    const createFailure = new Error(providerMessage)
    const expectedRecord: CreateBaseResumeRecord = {
      activeSlot: 1,
      contentSha256,
      id: baseResumeId,
      originalFilename: 'Frontend Engineer.pdf',
      sizeBytes: bytes.byteLength,
      storageObjectKey: objectKey,
    }
    const { dependencies, repository, storage } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw createFailure
        }),
        findById: vi.fn(async () => toPersistedResume(expectedRecord)),
      },
    })

    await expect(
      uploadBaseResume(context, candidate, dependencies),
    ).resolves.toMatchObject({ id: baseResumeId })

    expect(repository.findById).toHaveBeenCalledWith(baseResumeId)
    expect(storage.removeUntrackedObject).not.toHaveBeenCalled()
  })

  it('rejects an inconsistent successful insert result without cleanup', async () => {
    const { dependencies, storage } = createDependencies({
      repository: {
        create: vi.fn(async (record) => ({
          ...toPersistedResume(record),
          contentSha256: 'b'.repeat(64),
        })),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'inconsistent-state',
      },
    )

    expect(storage.removeUntrackedObject).not.toHaveBeenCalled()
  })

  it('cleans an untracked object when persistence definitively failed', async () => {
    const { dependencies, storage } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        findById: vi.fn(async () => null),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'persistence-unavailable',
      },
    )

    expect(storage.removeUntrackedObject).toHaveBeenCalledWith(objectKey)
    expect(storage.objectExists).not.toHaveBeenCalled()
  })

  it('accepts confirmed absence after an empty cleanup result', async () => {
    const { dependencies, storage } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        findById: vi.fn(async () => null),
      },
      storage: {
        objectExists: vi.fn(async () => false),
        removeUntrackedObject: vi.fn(async () => 'not-removed'),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'persistence-unavailable',
      },
    )

    expect(storage.objectExists).toHaveBeenCalledWith(objectKey)
  })

  it('upgrades a surviving orphan to a compensation failure', async () => {
    const { dependencies } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        findById: vi.fn(async () => null),
      },
      storage: {
        objectExists: vi.fn(async () => true),
        removeUntrackedObject: vi.fn(async () => 'not-removed'),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'compensation-failed',
      },
    )
  })

  it('compensates an ambiguous Storage upload failure before surfacing it', async () => {
    const { dependencies, repository, storage } = createDependencies({
      storage: {
        objectExists: vi.fn(async () => false),
        removeUntrackedObject: vi.fn(async () => 'not-removed'),
        uploadImmutableObject: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'storage-unavailable',
      },
    )

    expect(storage.removeUntrackedObject).toHaveBeenCalledWith(objectKey)
    expect(storage.objectExists).toHaveBeenCalledWith(objectKey)
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('requires confirmed removal when insert reconciliation itself fails', async () => {
    const { dependencies } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        findById: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
      },
      storage: {
        objectExists: vi.fn(async () => false),
        removeUntrackedObject: vi.fn(async () => 'not-removed'),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'compensation-failed',
      },
    )
  })

  it('does not clean up a persisted row whose identity is inconsistent', async () => {
    const expectedRecord: CreateBaseResumeRecord = {
      activeSlot: 1,
      contentSha256,
      id: baseResumeId,
      originalFilename: 'Frontend Engineer.pdf',
      sizeBytes: bytes.byteLength,
      storageObjectKey: objectKey,
    }
    const { dependencies, storage } = createDependencies({
      repository: {
        create: vi.fn(async () => {
          throw new Error(providerMessage)
        }),
        findById: vi.fn(async () => ({
          ...toPersistedResume(expectedRecord),
          contentSha256: 'b'.repeat(64),
        })),
      },
    })

    await expectServiceError(
      () => uploadBaseResume(context, candidate, dependencies),
      {
        code: 'base-resume-upload-unavailable',
        kind: 'inconsistent-state',
      },
    )

    expect(storage.removeUntrackedObject).not.toHaveBeenCalled()
  })
})
