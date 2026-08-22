import { z } from 'zod'

import { baseResumeOriginalFilenameSchema } from '../../shared/base-resumes/upload'
import { createBaseResumeObjectKey } from '../domain/base-resumes/upload'
import type { ProductDataRepositoryContext } from './product-data/context'

const baseResumePreviewProjection =
  'id,original_filename,storage_object_key' as const

const baseResumePreviewSourceRowSchema = z
  .object({
    id: z.uuid(),
    original_filename: baseResumeOriginalFilenameSchema,
    storage_object_key: z.string().min(1),
  })
  .strict()

export interface BaseResumePreviewSource {
  id: string
  originalFilename: string
  storageObjectKey: string
}

export type BaseResumePreviewRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export class BaseResumePreviewRepositoryError extends Error {
  readonly code = 'base-resume-preview-unavailable'
  readonly operation = 'find-active-base-resume-preview-source'

  constructor(
    readonly kind: BaseResumePreviewRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Base resume preview data is temporarily unavailable.', { cause })
    this.name = 'BaseResumePreviewRepositoryError'
  }
}

export interface BaseResumePreviewRepository {
  findActiveById(id: string): Promise<BaseResumePreviewSource | null>
}

const createRepositoryError = (
  kind: BaseResumePreviewRepositoryErrorKind,
  cause: unknown,
): BaseResumePreviewRepositoryError =>
  new BaseResumePreviewRepositoryError(kind, cause)

const parsePreviewSource = (
  data: unknown,
  expectedUserId: string,
): BaseResumePreviewSource => {
  const row = baseResumePreviewSourceRowSchema.parse(data)
  const expectedStorageObjectKey = createBaseResumeObjectKey(
    expectedUserId,
    row.id,
  )

  if (row.storage_object_key !== expectedStorageObjectKey) {
    throw new Error('The base-resume Storage identity was inconsistent.')
  }

  return {
    id: row.id,
    originalFilename: row.original_filename,
    storageObjectKey: row.storage_object_key,
  }
}

export function createBaseResumePreviewRepository({
  client,
  userId,
}: ProductDataRepositoryContext): BaseResumePreviewRepository {
  return {
    async findActiveById(id) {
      try {
        const { data, error } = await client
          .from('base_resumes')
          .select(baseResumePreviewProjection)
          .eq('user_id', userId)
          .eq('id', id)
          .not('active_slot', 'is', null)
          .is('retired_at', null)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parsePreviewSource(data, userId)
        } catch (error) {
          throw createRepositoryError('unexpected-result', error)
        }
      } catch (error) {
        if (error instanceof BaseResumePreviewRepositoryError) {
          throw error
        }

        throw createRepositoryError('provider-failure', error)
      }
    },
  }
}
