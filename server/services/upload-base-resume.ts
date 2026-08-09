import type {
  ActiveBaseResumeSlot,
  UploadedBaseResume,
} from '../../shared/base-resumes/upload'
import { BASE_RESUME_CONTENT_TYPE } from '../../shared/base-resumes/constraints'
import {
  BaseResumeUploadDomainError,
  calculateBaseResumeSha256,
  createBaseResumeObjectKey,
  findLowestAvailableBaseResumeSlot,
  type BaseResumeUploadCandidate,
  validateBaseResumeUpload,
} from '../domain/base-resumes/upload'
import {
  createBaseResumeStorage,
  type BaseResumeStorage,
} from '../infrastructure/supabase/base-resume-storage'
import {
  BaseResumeUploadRepositoryError,
  createBaseResumeUploadRepository,
  type BaseResumeUploadRepository,
  type CreateBaseResumeRecord,
  type PersistedBaseResume,
} from '../repositories/base-resume-uploads'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'

export type BaseResumeUploadServiceErrorKind =
  | 'active-resume-limit-reached'
  | 'compensation-failed'
  | 'inconsistent-state'
  | 'persistence-unavailable'
  | 'storage-unavailable'
  | 'unexpected-failure'

type CleanupOutcome = 'absent' | 'removed'

export interface BaseResumeUploadServiceDependencies {
  calculateSha256(bytes: Uint8Array): Promise<string>
  createId(): string
  createRepository(
    context: ProductDataRepositoryContext,
  ): BaseResumeUploadRepository
  createStorage(
    client: ProductDataRepositoryContext['client'],
  ): BaseResumeStorage
}

export class BaseResumeUploadServiceError extends Error {
  readonly code:
    'active-resume-limit-reached' | 'base-resume-upload-unavailable'

  constructor(
    readonly kind: BaseResumeUploadServiceErrorKind,
    cause?: unknown,
  ) {
    const activeLimitReached = kind === 'active-resume-limit-reached'

    super(
      activeLimitReached
        ? 'The active base resume limit has been reached.'
        : 'Base resume upload is temporarily unavailable.',
      { cause },
    )
    this.name = 'BaseResumeUploadServiceError'
    this.code = activeLimitReached
      ? 'active-resume-limit-reached'
      : 'base-resume-upload-unavailable'
  }
}

const defaultDependencies: BaseResumeUploadServiceDependencies = {
  calculateSha256: calculateBaseResumeSha256,
  createId: () => globalThis.crypto.randomUUID(),
  createRepository: createBaseResumeUploadRepository,
  createStorage: createBaseResumeStorage,
}

const createServiceError = (
  kind: BaseResumeUploadServiceErrorKind,
  cause?: unknown,
): BaseResumeUploadServiceError => new BaseResumeUploadServiceError(kind, cause)

const compensateUntrackedObject = async (
  storage: BaseResumeStorage,
  objectKey: string,
  originalFailure: unknown,
): Promise<CleanupOutcome> => {
  let removalResult: Awaited<
    ReturnType<BaseResumeStorage['removeUntrackedObject']>
  >

  try {
    removalResult = await storage.removeUntrackedObject(objectKey)
  } catch (compensationFailure) {
    throw createServiceError('compensation-failed', {
      compensationFailure,
      originalFailure,
    })
  }

  if (removalResult === 'removed') {
    return 'removed'
  }

  let objectExists: boolean

  try {
    objectExists = await storage.objectExists(objectKey)
  } catch (compensationFailure) {
    throw createServiceError('compensation-failed', {
      compensationFailure,
      originalFailure,
    })
  }

  if (objectExists) {
    throw createServiceError('compensation-failed', originalFailure)
  }

  return 'absent'
}

const isMatchingPersistedResume = (
  persisted: PersistedBaseResume,
  expected: CreateBaseResumeRecord,
): boolean =>
  persisted.activeSlot === expected.activeSlot &&
  persisted.contentSha256 === expected.contentSha256 &&
  persisted.contentType === BASE_RESUME_CONTENT_TYPE &&
  persisted.id === expected.id &&
  persisted.originalFilename === expected.originalFilename &&
  persisted.retiredAt === null &&
  persisted.sizeBytes === expected.sizeBytes &&
  persisted.storageObjectKey === expected.storageObjectKey

const toUploadedBaseResume = (
  persisted: PersistedBaseResume,
): UploadedBaseResume => ({
  activeSlot: persisted.activeSlot,
  createdAt: persisted.createdAt,
  id: persisted.id,
  originalFilename: persisted.originalFilename,
})

const reconcileCreateFailure = async (
  repository: BaseResumeUploadRepository,
  storage: BaseResumeStorage,
  record: CreateBaseResumeRecord,
  createFailure: unknown,
): Promise<PersistedBaseResume> => {
  let persisted: PersistedBaseResume | null

  try {
    persisted = await repository.findById(record.id)
  } catch (reconciliationFailure) {
    const cleanupOutcome = await compensateUntrackedObject(
      storage,
      record.storageObjectKey,
      createFailure,
    )

    if (cleanupOutcome !== 'removed') {
      throw createServiceError('compensation-failed', {
        createFailure,
        reconciliationFailure,
      })
    }

    throw createServiceError('persistence-unavailable', {
      createFailure,
      reconciliationFailure,
    })
  }

  if (persisted) {
    if (isMatchingPersistedResume(persisted, record)) {
      return persisted
    }

    throw createServiceError('inconsistent-state', createFailure)
  }

  await compensateUntrackedObject(
    storage,
    record.storageObjectKey,
    createFailure,
  )

  throw createServiceError('persistence-unavailable', createFailure)
}

const getActiveSlots = async (
  repository: BaseResumeUploadRepository,
): Promise<readonly ActiveBaseResumeSlot[]> => {
  try {
    return await repository.listActiveSlots()
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }
}

const prepareUploadIdentity = async (
  context: ProductDataRepositoryContext,
  bytes: Uint8Array,
  dependencies: BaseResumeUploadServiceDependencies,
): Promise<{
  contentSha256: string
  id: string
  storageObjectKey: string
}> => {
  try {
    const id = dependencies.createId()
    const contentSha256 = await dependencies.calculateSha256(bytes)

    if (!/^[0-9a-f]{64}$/u.test(contentSha256)) {
      throw new Error('The SHA-256 dependency returned an invalid digest.')
    }

    return {
      contentSha256,
      id,
      storageObjectKey: createBaseResumeObjectKey(context.userId, id),
    }
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }
}

export async function uploadBaseResume(
  context: ProductDataRepositoryContext,
  candidate: BaseResumeUploadCandidate,
  dependencies: BaseResumeUploadServiceDependencies = defaultDependencies,
): Promise<UploadedBaseResume> {
  let validated: ReturnType<typeof validateBaseResumeUpload>

  try {
    validated = validateBaseResumeUpload(candidate)
  } catch (error) {
    if (error instanceof BaseResumeUploadDomainError) {
      throw error
    }

    throw createServiceError('unexpected-failure', error)
  }

  let repository: BaseResumeUploadRepository
  let storage: BaseResumeStorage

  try {
    repository = dependencies.createRepository(context)
    storage = dependencies.createStorage(context.client)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  const initialSlots = await getActiveSlots(repository)
  let activeSlot = findLowestAvailableBaseResumeSlot(initialSlots)

  if (activeSlot === null) {
    throw createServiceError('active-resume-limit-reached')
  }

  const identity = await prepareUploadIdentity(
    context,
    validated.bytes,
    dependencies,
  )
  const recordWithoutSlot = {
    contentSha256: identity.contentSha256,
    id: identity.id,
    originalFilename: validated.originalFilename,
    sizeBytes: validated.bytes.byteLength,
    storageObjectKey: identity.storageObjectKey,
  }

  try {
    await storage.uploadImmutableObject({
      bytes: validated.bytes,
      objectKey: identity.storageObjectKey,
    })
  } catch (uploadFailure) {
    await compensateUntrackedObject(
      storage,
      identity.storageObjectKey,
      uploadFailure,
    )
    throw createServiceError('storage-unavailable', uploadFailure)
  }

  const attemptedSlots = new Set<ActiveBaseResumeSlot>()

  while (activeSlot !== null) {
    attemptedSlots.add(activeSlot)
    const record: CreateBaseResumeRecord = {
      ...recordWithoutSlot,
      activeSlot,
    }

    try {
      const persisted = await repository.create(record)

      if (!isMatchingPersistedResume(persisted, record)) {
        throw createServiceError('inconsistent-state')
      }

      return toUploadedBaseResume(persisted)
    } catch (createFailure) {
      if (createFailure instanceof BaseResumeUploadServiceError) {
        throw createFailure
      }

      const activeSlotConflict =
        createFailure instanceof BaseResumeUploadRepositoryError &&
        createFailure.kind === 'active-slot-conflict'

      if (!activeSlotConflict) {
        const persisted = await reconcileCreateFailure(
          repository,
          storage,
          record,
          createFailure,
        )

        return toUploadedBaseResume(persisted)
      }

      let currentSlots: readonly ActiveBaseResumeSlot[]

      try {
        currentSlots = await repository.listActiveSlots()
      } catch (slotReadFailure) {
        await compensateUntrackedObject(
          storage,
          identity.storageObjectKey,
          slotReadFailure,
        )
        throw createServiceError('persistence-unavailable', slotReadFailure)
      }

      activeSlot = findLowestAvailableBaseResumeSlot([
        ...currentSlots,
        ...attemptedSlots,
      ])

      if (activeSlot === null) {
        await compensateUntrackedObject(
          storage,
          identity.storageObjectKey,
          createFailure,
        )
        throw createServiceError('active-resume-limit-reached', createFailure)
      }
    }
  }

  throw createServiceError('unexpected-failure')
}
