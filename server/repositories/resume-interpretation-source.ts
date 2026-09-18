import { z } from 'zod'

import {
  BASE_RESUME_CONTENT_TYPE,
  MAXIMUM_BASE_RESUME_SIZE_BYTES,
} from '../../shared/base-resumes/constraints'
import { baseResumeOriginalFilenameSchema } from '../../shared/base-resumes/upload'
import { createBaseResumeObjectKey } from '../domain/base-resumes/upload'
import type { ProductDataRepositoryContext } from './product-data/context'

const interpretationSourceProjection =
  'id,selected_base_resume_id,selected_base_resume:base_resumes!applications_selected_base_resume_fkey(id,content_sha256,content_type,original_filename,size_bytes,storage_object_key,active_slot,retired_at)' as const

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const timestampSchema = z.iso.datetime({ offset: true })

const selectedBaseResumeSchema = z
  .object({
    active_slot: z.number().int().min(1).max(3).nullable(),
    content_sha256: sha256Schema,
    content_type: z.literal(BASE_RESUME_CONTENT_TYPE),
    id: z.uuid(),
    original_filename: baseResumeOriginalFilenameSchema,
    retired_at: timestampSchema.nullable(),
    size_bytes: z.number().int().positive().max(MAXIMUM_BASE_RESUME_SIZE_BYTES),
    storage_object_key: z.string().min(1),
  })
  .strict()

const interpretationSourceRowSchema = z
  .object({
    id: z.uuid(),
    selected_base_resume: selectedBaseResumeSchema.nullable(),
    selected_base_resume_id: z.uuid().nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      (row.selected_base_resume_id === null) !==
      (row.selected_base_resume === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The selected base resume relationship is inconsistent.',
        path: ['selected_base_resume'],
      })
    }

    if (
      row.selected_base_resume_id !== null &&
      row.selected_base_resume !== null &&
      row.selected_base_resume.id !== row.selected_base_resume_id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The selected base resume relationship is inconsistent.',
        path: ['selected_base_resume'],
      })
    }
  })

export interface ResumeInterpretationSource {
  baseResumeId: string
  contentSha256: string
  originalFilename: string
  sizeBytes: number
  storageObjectKey: string
}

export type ResumeInterpretationSourceRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export class ResumeInterpretationSourceRepositoryError extends Error {
  readonly code = 'resume-interpretation-source-unavailable'
  readonly operation = 'find-selected-active-base-resume-interpretation-source'

  constructor(
    readonly kind: ResumeInterpretationSourceRepositoryErrorKind,
    cause: unknown,
  ) {
    super('The selected base resume is temporarily unavailable.', { cause })
    this.name = 'ResumeInterpretationSourceRepositoryError'
  }
}

export interface ResumeInterpretationSourceRepository {
  findForApplication(
    applicationId: string,
  ): Promise<ResumeInterpretationSource | null>
}

const createRepositoryError = (
  kind: ResumeInterpretationSourceRepositoryErrorKind,
  cause: unknown,
): ResumeInterpretationSourceRepositoryError =>
  new ResumeInterpretationSourceRepositoryError(kind, cause)

const parseInterpretationSource = (
  data: unknown,
  expectedUserId: string,
): ResumeInterpretationSource | null => {
  const row = interpretationSourceRowSchema.parse(data)

  if (row.selected_base_resume === null) {
    return null
  }

  if (
    row.selected_base_resume.active_slot === null &&
    row.selected_base_resume.retired_at !== null
  ) {
    return null
  }

  if (
    row.selected_base_resume.active_slot === null ||
    row.selected_base_resume.retired_at !== null
  ) {
    throw new Error('The selected base resume lifecycle was inconsistent.')
  }

  const expectedStorageObjectKey = createBaseResumeObjectKey(
    expectedUserId,
    row.selected_base_resume.id,
  )

  if (
    row.selected_base_resume.storage_object_key !== expectedStorageObjectKey
  ) {
    throw new Error('The base-resume Storage identity was inconsistent.')
  }

  return {
    baseResumeId: row.selected_base_resume.id,
    contentSha256: row.selected_base_resume.content_sha256,
    originalFilename: row.selected_base_resume.original_filename,
    sizeBytes: row.selected_base_resume.size_bytes,
    storageObjectKey: row.selected_base_resume.storage_object_key,
  }
}

export function createResumeInterpretationSourceRepository({
  client,
  userId,
}: ProductDataRepositoryContext): ResumeInterpretationSourceRepository {
  return {
    async findForApplication(applicationId) {
      try {
        const { data, error } = await client
          .from('applications')
          .select(interpretationSourceProjection)
          .eq('user_id', userId)
          .eq('id', applicationId)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parseInterpretationSource(data, userId)
        } catch (error) {
          throw createRepositoryError('unexpected-result', error)
        }
      } catch (error) {
        if (error instanceof ResumeInterpretationSourceRepositoryError) {
          throw error
        }

        throw createRepositoryError('provider-failure', error)
      }
    },
  }
}
