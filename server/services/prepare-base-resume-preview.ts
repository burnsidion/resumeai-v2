import {
  BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
  baseResumePreviewSchema,
  type BaseResumePreview,
} from '../../shared/base-resumes/preview'
import {
  createBaseResumePreviewStorage,
  type BaseResumePreviewStorage,
} from '../infrastructure/supabase/base-resume-preview-storage'
import {
  createBaseResumePreviewRepository,
  type BaseResumePreviewRepository,
} from '../repositories/base-resume-preview'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'

export type BaseResumePreviewServiceErrorKind =
  | 'base-resume-unavailable'
  | 'inconsistent-state'
  | 'persistence-unavailable'
  | 'storage-unavailable'
  | 'unexpected-failure'

export class BaseResumePreviewServiceError extends Error {
  readonly code: 'base-resume-preview-unavailable' | 'base-resume-unavailable'

  constructor(
    readonly kind: BaseResumePreviewServiceErrorKind,
    cause?: unknown,
  ) {
    const unavailable = kind === 'base-resume-unavailable'

    super(
      unavailable
        ? 'The base resume is unavailable.'
        : 'Base resume preview is temporarily unavailable.',
      { cause },
    )
    this.name = 'BaseResumePreviewServiceError'
    this.code = unavailable
      ? 'base-resume-unavailable'
      : 'base-resume-preview-unavailable'
  }
}

export interface BaseResumePreviewServiceDependencies {
  createRepository(
    context: ProductDataRepositoryContext,
  ): BaseResumePreviewRepository
  createStorage(
    client: ProductDataRepositoryContext['client'],
  ): BaseResumePreviewStorage
  now(): Date
}

const defaultDependencies: BaseResumePreviewServiceDependencies = {
  createRepository: createBaseResumePreviewRepository,
  createStorage: createBaseResumePreviewStorage,
  now: () => new Date(),
}

const createServiceError = (
  kind: BaseResumePreviewServiceErrorKind,
  cause?: unknown,
): BaseResumePreviewServiceError =>
  new BaseResumePreviewServiceError(kind, cause)

export async function prepareBaseResumePreview(
  context: ProductDataRepositoryContext,
  id: string,
  dependencies: BaseResumePreviewServiceDependencies = defaultDependencies,
): Promise<BaseResumePreview> {
  let repository: BaseResumePreviewRepository
  let storage: BaseResumePreviewStorage

  try {
    repository = dependencies.createRepository(context)
    storage = dependencies.createStorage(context.client)
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  let source: Awaited<ReturnType<typeof repository.findActiveById>>

  try {
    source = await repository.findActiveById(id)
  } catch (error) {
    throw createServiceError('persistence-unavailable', error)
  }

  if (source === null) {
    throw createServiceError('base-resume-unavailable')
  }

  if (source.id !== id) {
    throw createServiceError('inconsistent-state')
  }

  let issuedAt: Date

  try {
    issuedAt = dependencies.now()

    if (!Number.isFinite(issuedAt.getTime())) {
      throw new Error('The preview clock was invalid.')
    }
  } catch (error) {
    throw createServiceError('unexpected-failure', error)
  }

  let url: string

  try {
    url = await storage.createSignedPreviewUrl(
      source.storageObjectKey,
      BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
    )
  } catch (error) {
    throw createServiceError('storage-unavailable', error)
  }

  try {
    return baseResumePreviewSchema.parse({
      baseResumeId: source.id,
      expiresAt: new Date(
        issuedAt.getTime() +
          BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS * 1_000,
      ).toISOString(),
      originalFilename: source.originalFilename,
      url,
    })
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }
}
