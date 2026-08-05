import { z } from 'zod'

import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
  type ActiveBaseResumeSlot,
} from '../../shared/base-resumes/upload'
import {
  BASE_RESUME_CONTENT_TYPE,
  MAXIMUM_BASE_RESUME_SIZE_BYTES,
} from '../domain/base-resumes/upload'
import type { Database } from '../infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from './product-data/context'

const baseResumePersistenceProjection =
  'id,original_filename,storage_object_key,content_type,size_bytes,content_sha256,active_slot,created_at,retired_at' as const

const persistedBaseResumeSchema = z
  .object({
    active_slot: activeBaseResumeSlotSchema,
    content_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    content_type: z.literal(BASE_RESUME_CONTENT_TYPE),
    created_at: z.iso.datetime({ offset: true }),
    id: z.uuid(),
    original_filename: baseResumeOriginalFilenameSchema,
    retired_at: z.null(),
    size_bytes: z.number().int().positive().max(MAXIMUM_BASE_RESUME_SIZE_BYTES),
    storage_object_key: z.string().min(1),
  })
  .strict()

const activeSlotRowsSchema = z
  .array(
    z
      .object({
        active_slot: activeBaseResumeSlotSchema,
      })
      .strict(),
  )
  .max(3)

export type BaseResumeUploadRepositoryOperation =
  | 'create-base-resume'
  | 'find-base-resume-by-id'
  | 'list-active-base-resume-slots'

export type BaseResumeUploadRepositoryErrorKind =
  'active-slot-conflict' | 'provider-failure' | 'unexpected-result'

export interface CreateBaseResumeRecord {
  activeSlot: ActiveBaseResumeSlot
  contentSha256: string
  id: string
  originalFilename: string
  sizeBytes: number
  storageObjectKey: string
}

export interface PersistedBaseResume extends CreateBaseResumeRecord {
  contentType: typeof BASE_RESUME_CONTENT_TYPE
  createdAt: string
  retiredAt: null
}

export interface BaseResumeUploadRepository {
  create(record: CreateBaseResumeRecord): Promise<PersistedBaseResume>
  findById(id: string): Promise<PersistedBaseResume | null>
  listActiveSlots(): Promise<readonly ActiveBaseResumeSlot[]>
}

interface ProviderErrorShape {
  code?: unknown
  message?: unknown
}

export class BaseResumeUploadRepositoryError extends Error {
  readonly code = 'base-resume-persistence-unavailable'

  constructor(
    readonly operation: BaseResumeUploadRepositoryOperation,
    readonly kind: BaseResumeUploadRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Base resume persistence is temporarily unavailable.', { cause })
    this.name = 'BaseResumeUploadRepositoryError'
  }
}

const isActiveSlotConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const providerError = error as ProviderErrorShape

  return (
    providerError.code === '23505' &&
    typeof providerError.message === 'string' &&
    providerError.message.includes('base_resumes_user_active_slot_key')
  )
}

const createRepositoryError = (
  operation: BaseResumeUploadRepositoryOperation,
  cause: unknown,
  kind: BaseResumeUploadRepositoryErrorKind = 'provider-failure',
): BaseResumeUploadRepositoryError =>
  new BaseResumeUploadRepositoryError(
    operation,
    operation === 'create-base-resume' && isActiveSlotConflict(cause)
      ? 'active-slot-conflict'
      : kind,
    cause,
  )

const parsePersistedBaseResume = (data: unknown): PersistedBaseResume => {
  const result = persistedBaseResumeSchema.parse(data)

  return {
    activeSlot: result.active_slot,
    contentSha256: result.content_sha256,
    contentType: result.content_type,
    createdAt: result.created_at,
    id: result.id,
    originalFilename: result.original_filename,
    retiredAt: result.retired_at,
    sizeBytes: result.size_bytes,
    storageObjectKey: result.storage_object_key,
  }
}

export function createBaseResumeUploadRepository({
  client,
  userId,
}: ProductDataRepositoryContext): BaseResumeUploadRepository {
  return {
    async create(record) {
      try {
        const insert = {
          active_slot: record.activeSlot,
          content_sha256: record.contentSha256,
          content_type: BASE_RESUME_CONTENT_TYPE,
          id: record.id,
          original_filename: record.originalFilename,
          size_bytes: record.sizeBytes,
          storage_object_key: record.storageObjectKey,
          user_id: userId,
        } satisfies Database['public']['Tables']['base_resumes']['Insert']
        const { data, error } = await client
          .from('base_resumes')
          .insert(insert)
          .select(baseResumePersistenceProjection)
          .single()

        if (error) {
          throw error
        }

        try {
          return parsePersistedBaseResume(data)
        } catch (error) {
          throw createRepositoryError(
            'create-base-resume',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof BaseResumeUploadRepositoryError) {
          throw error
        }

        throw createRepositoryError('create-base-resume', error)
      }
    },

    async findById(id) {
      try {
        const { data, error } = await client
          .from('base_resumes')
          .select(baseResumePersistenceProjection)
          .eq('user_id', userId)
          .eq('id', id)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parsePersistedBaseResume(data)
        } catch (error) {
          throw createRepositoryError(
            'find-base-resume-by-id',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof BaseResumeUploadRepositoryError) {
          throw error
        }

        throw createRepositoryError('find-base-resume-by-id', error)
      }
    },

    async listActiveSlots() {
      try {
        const { data, error } = await client
          .from('base_resumes')
          .select('active_slot')
          .eq('user_id', userId)
          .not('active_slot', 'is', null)
          .order('active_slot', { ascending: true })
          .limit(3)

        if (error) {
          throw error
        }

        try {
          return activeSlotRowsSchema
            .parse(data)
            .map(({ active_slot }) => active_slot)
        } catch (error) {
          throw createRepositoryError(
            'list-active-base-resume-slots',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof BaseResumeUploadRepositoryError) {
          throw error
        }

        throw createRepositoryError('list-active-base-resume-slots', error)
      }
    },
  }
}
