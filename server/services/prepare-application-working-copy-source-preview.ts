import {
  BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
  baseResumePreviewSchema,
  type BaseResumePreview,
} from '../../shared/base-resumes/preview'
import {
  createBaseResumePreviewStorage,
  type BaseResumePreviewStorage,
} from '../infrastructure/supabase/base-resume-preview-storage'
import { createApplicationManagementRepository } from '../repositories/application-management'
import type { ProductDataRepositoryContext } from '../repositories/product-data/context'
import { createTailoringWorkingCopiesRepository } from '../repositories/tailoring-working-copies'
import {
  ApplicationWorkingCopyReviewServiceError,
  loadApplicationWorkingCopyReviewRecord,
  type ApplicationWorkingCopyReviewDependencies,
} from './application-working-copy-review'

export type ApplicationWorkingCopySourcePreviewServiceErrorKind =
  | 'application-unavailable'
  | 'inconsistent-state'
  | 'persistence-unavailable'
  | 'storage-unavailable'
  | 'working-copy-unavailable'

export class ApplicationWorkingCopySourcePreviewServiceError extends Error {
  readonly code = 'working-copy-review-unavailable'

  constructor(
    readonly kind: ApplicationWorkingCopySourcePreviewServiceErrorKind,
    cause?: unknown,
  ) {
    super('The source-resume preview is temporarily unavailable.', { cause })
    this.name = 'ApplicationWorkingCopySourcePreviewServiceError'
  }
}

export interface ApplicationWorkingCopySourcePreviewDependencies extends ApplicationWorkingCopyReviewDependencies {
  createStorage(
    client: ProductDataRepositoryContext['client'],
  ): BaseResumePreviewStorage
  now(): Date
}

const defaultDependencies: ApplicationWorkingCopySourcePreviewDependencies = {
  createApplicationRepository: createApplicationManagementRepository,
  createStorage: createBaseResumePreviewStorage,
  createWorkingCopiesRepository: createTailoringWorkingCopiesRepository,
  now: () => new Date(),
}

const createServiceError = (
  kind: ApplicationWorkingCopySourcePreviewServiceErrorKind,
  cause?: unknown,
): ApplicationWorkingCopySourcePreviewServiceError =>
  new ApplicationWorkingCopySourcePreviewServiceError(kind, cause)

const mapReviewError = (
  error: ApplicationWorkingCopyReviewServiceError,
): ApplicationWorkingCopySourcePreviewServiceError =>
  createServiceError(error.kind, error)

export async function prepareApplicationWorkingCopySourcePreview(
  context: ProductDataRepositoryContext,
  applicationId: string,
  dependencies: ApplicationWorkingCopySourcePreviewDependencies = defaultDependencies,
): Promise<BaseResumePreview> {
  let record: Awaited<ReturnType<typeof loadApplicationWorkingCopyReviewRecord>>

  try {
    record = await loadApplicationWorkingCopyReviewRecord(
      context,
      applicationId,
      {
        createApplicationRepository: dependencies.createApplicationRepository,
        createWorkingCopiesRepository:
          dependencies.createWorkingCopiesRepository,
      },
    )
  } catch (error) {
    if (error instanceof ApplicationWorkingCopyReviewServiceError) {
      throw mapReviewError(error)
    }

    throw createServiceError('persistence-unavailable', error)
  }

  let issuedAt: Date
  let storage: BaseResumePreviewStorage

  try {
    issuedAt = dependencies.now()
    storage = dependencies.createStorage(context.client)

    if (!Number.isFinite(issuedAt.getTime())) {
      throw new Error('The preview clock was invalid.')
    }
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }

  let url: string

  try {
    url = await storage.createSignedPreviewUrl(
      record.sourceBaseResume.storageObjectKey,
      BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
    )
  } catch (error) {
    throw createServiceError('storage-unavailable', error)
  }

  try {
    return baseResumePreviewSchema.parse({
      baseResumeId: record.sourceBaseResume.id,
      expiresAt: new Date(
        issuedAt.getTime() +
          BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS * 1_000,
      ).toISOString(),
      originalFilename: record.sourceBaseResume.originalFilename,
      url,
    })
  } catch (error) {
    throw createServiceError('inconsistent-state', error)
  }
}
