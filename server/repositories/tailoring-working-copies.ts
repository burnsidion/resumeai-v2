import { z } from 'zod'

import {
  tailoringWorkingCopyProposalSchema,
  type TailoringWorkingCopyProposal,
  type TailoringWorkingCopyProvenance,
} from '../domain/tailoring/working-copy'
import {
  resumeInterpretationStructuredContentSchema,
  resumeLogicalSectionSchema,
  type ResumeInterpretationStructuredContent,
} from '../domain/resume-interpretations/contracts'
import { baseResumeOriginalFilenameSchema } from '../../shared/base-resumes/upload'
import {
  tailoringWorkingCopySummarySchema,
  type TailoringWorkingCopySummary,
} from '../../shared/tailoring/status'
import type { Database } from '../infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from './product-data/context'

const currentWorkingCopyProjection =
  'id,state,revision_number,updated_at' as const
const currentWorkingCopyReviewProjection =
  'id,application_id,state,revision_number,updated_at,structured_content,change_summary,source_base_resume_id,source_interpretation_id,source_base_resume:base_resumes!working_copies_base_resume_fkey(id,original_filename,storage_object_key),source_interpretation:resume_interpretations!working_copies_interpretation_fkey(id,base_resume_id,structured_content)' as const
const timestampSchema = z.iso.datetime({ offset: true })

const currentWorkingCopyRowSchema = z
  .object({
    id: z.uuid(),
    revision_number: z.number().int().positive(),
    state: z.enum(['accepted', 'awaiting_review']),
    updated_at: timestampSchema,
  })
  .strict()

export interface ReplaceCurrentWorkingCopyRecord {
  applicationId: string
  contentSha256: string
  proposal: TailoringWorkingCopyProposal
  provenance: TailoringWorkingCopyProvenance
  sourceBaseResumeId: string
  sourceInterpretationId: string
  updatedAt: string
}

export interface PersistedCurrentWorkingCopy {
  id: string
  revisionNumber: number
  updatedAt: string
}

const workingCopyStructuredContentSchema = z
  .object({
    sections: z.array(resumeLogicalSectionSchema).min(1),
  })
  .strict()

const currentWorkingCopyReviewRowSchema = z
  .object({
    application_id: z.uuid(),
    change_summary: z.unknown(),
    id: z.uuid(),
    revision_number: z.number().int().positive(),
    source_base_resume: z
      .object({
        id: z.uuid(),
        original_filename: baseResumeOriginalFilenameSchema,
        storage_object_key: z.string().trim().min(1),
      })
      .strict(),
    source_base_resume_id: z.uuid(),
    source_interpretation: z
      .object({
        base_resume_id: z.uuid(),
        id: z.uuid(),
        structured_content: resumeInterpretationStructuredContentSchema,
      })
      .strict(),
    source_interpretation_id: z.uuid(),
    state: z.enum(['accepted', 'awaiting_review']),
    structured_content: z.unknown(),
    updated_at: timestampSchema,
  })
  .strict()

export interface CurrentWorkingCopyReviewRecord {
  applicationId: string
  changeSummary: TailoringWorkingCopyProposal['changeSummary']
  id: string
  proposalSections: TailoringWorkingCopyProposal['sections']
  revisionNumber: number
  sourceBaseResume: {
    id: string
    originalFilename: string
    storageObjectKey: string
  }
  sourceInterpretation: {
    id: string
    structuredContent: ResumeInterpretationStructuredContent
  }
  state: TailoringWorkingCopySummary['state']
  updatedAt: string
}

export type TailoringWorkingCopiesRepositoryOperation =
  | 'accept-current-working-copy'
  | 'discard-current-working-copy'
  | 'find-current-working-copy'
  | 'find-current-working-copy-review'
  | 'replace-current-working-copy'

export type TailoringWorkingCopiesRepositoryErrorKind =
  | 'accepted-working-copy'
  | 'provider-failure'
  | 'unexpected-result'
  | 'working-copy-unavailable'

export class TailoringWorkingCopiesRepositoryError extends Error {
  readonly code = 'working-copy-persistence-unavailable'

  constructor(
    readonly operation: TailoringWorkingCopiesRepositoryOperation,
    readonly kind: TailoringWorkingCopiesRepositoryErrorKind,
    cause?: unknown,
  ) {
    super('Working-copy persistence is temporarily unavailable.', { cause })
    this.name = 'TailoringWorkingCopiesRepositoryError'
  }
}

export interface TailoringWorkingCopiesRepository {
  acceptCurrent(
    applicationId: string,
    acceptedAt: string,
  ): Promise<TailoringWorkingCopySummary>
  discardCurrent(applicationId: string): Promise<string>
  findCurrent(
    applicationId: string,
  ): Promise<TailoringWorkingCopySummary | null>
  findCurrentReview(
    applicationId: string,
  ): Promise<CurrentWorkingCopyReviewRecord | null>
  replaceCurrent(
    record: ReplaceCurrentWorkingCopyRecord,
  ): Promise<PersistedCurrentWorkingCopy>
}

const createRepositoryError = (
  operation: TailoringWorkingCopiesRepositoryOperation,
  kind: TailoringWorkingCopiesRepositoryErrorKind,
  cause?: unknown,
): TailoringWorkingCopiesRepositoryError =>
  new TailoringWorkingCopiesRepositoryError(operation, kind, cause)

const parseCurrentWorkingCopySummary = (
  data: unknown,
): TailoringWorkingCopySummary => {
  const row = currentWorkingCopyRowSchema.parse(data)

  return tailoringWorkingCopySummarySchema.parse({
    id: row.id,
    revisionNumber: row.revision_number,
    state: row.state,
    updatedAt: row.updated_at,
  })
}

const toPersistedCurrentWorkingCopy = (
  summary: TailoringWorkingCopySummary,
): PersistedCurrentWorkingCopy => ({
  id: summary.id,
  revisionNumber: summary.revisionNumber,
  updatedAt: summary.updatedAt,
})

const getCurrentOrThrow = async (
  client: ProductDataRepositoryContext['client'],
  userId: string,
  applicationId: string,
): Promise<z.infer<typeof currentWorkingCopyRowSchema>> => {
  try {
    const { data, error } = await client
      .from('working_copies')
      .select(currentWorkingCopyProjection)
      .eq('user_id', userId)
      .eq('application_id', applicationId)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (data === null) {
      throw createRepositoryError(
        'find-current-working-copy',
        'working-copy-unavailable',
      )
    }

    return currentWorkingCopyRowSchema.parse(data)
  } catch (error) {
    if (error instanceof TailoringWorkingCopiesRepositoryError) {
      throw error
    }

    throw createRepositoryError(
      'find-current-working-copy',
      error instanceof z.ZodError ? 'unexpected-result' : 'provider-failure',
      error,
    )
  }
}

const parseCurrentWorkingCopyReview = (
  data: unknown,
): CurrentWorkingCopyReviewRecord => {
  const row = currentWorkingCopyReviewRowSchema.parse(data)

  if (
    row.source_base_resume.id !== row.source_base_resume_id ||
    row.source_interpretation.id !== row.source_interpretation_id ||
    row.source_interpretation.base_resume_id !== row.source_base_resume_id
  ) {
    throw new Error('The working-copy source relationships were inconsistent.')
  }

  const proposal = tailoringWorkingCopyProposalSchema.parse({
    changeSummary: row.change_summary,
    sections: workingCopyStructuredContentSchema.parse(row.structured_content)
      .sections,
  })

  return {
    applicationId: row.application_id,
    changeSummary: proposal.changeSummary,
    id: row.id,
    proposalSections: proposal.sections,
    revisionNumber: row.revision_number,
    sourceBaseResume: {
      id: row.source_base_resume.id,
      originalFilename: row.source_base_resume.original_filename,
      storageObjectKey: row.source_base_resume.storage_object_key,
    },
    sourceInterpretation: {
      id: row.source_interpretation.id,
      structuredContent: row.source_interpretation.structured_content,
    },
    state: row.state,
    updatedAt: row.updated_at,
  }
}

export function createTailoringWorkingCopiesRepository({
  client,
  userId,
}: ProductDataRepositoryContext): TailoringWorkingCopiesRepository {
  return {
    async acceptCurrent(applicationId, acceptedAt) {
      const current = await getCurrentOrThrow(client, userId, applicationId)

      if (current.state === 'accepted') {
        throw createRepositoryError(
          'accept-current-working-copy',
          'accepted-working-copy',
        )
      }

      try {
        const { data, error } = await client
          .from('working_copies')
          .update({
            accepted_at: acceptedAt,
            state: 'accepted',
            updated_at: acceptedAt,
          })
          .eq('user_id', userId)
          .eq('id', current.id)
          .eq('state', 'awaiting_review')
          .select(currentWorkingCopyProjection)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          throw createRepositoryError(
            'accept-current-working-copy',
            'accepted-working-copy',
          )
        }

        return parseCurrentWorkingCopySummary(data)
      } catch (error) {
        if (error instanceof TailoringWorkingCopiesRepositoryError) {
          throw error
        }

        throw createRepositoryError(
          'accept-current-working-copy',
          error instanceof z.ZodError
            ? 'unexpected-result'
            : 'provider-failure',
          error,
        )
      }
    },

    async discardCurrent(applicationId) {
      const current = await getCurrentOrThrow(client, userId, applicationId)

      if (current.state === 'accepted') {
        throw createRepositoryError(
          'discard-current-working-copy',
          'accepted-working-copy',
        )
      }

      try {
        const { data, error } = await client
          .from('working_copies')
          .delete()
          .eq('user_id', userId)
          .eq('id', current.id)
          .eq('state', 'awaiting_review')
          .select('id')
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          throw createRepositoryError(
            'discard-current-working-copy',
            'accepted-working-copy',
          )
        }

        return z.uuid().parse(data.id)
      } catch (error) {
        if (error instanceof TailoringWorkingCopiesRepositoryError) {
          throw error
        }

        throw createRepositoryError(
          'discard-current-working-copy',
          error instanceof z.ZodError
            ? 'unexpected-result'
            : 'provider-failure',
          error,
        )
      }
    },

    async findCurrent(applicationId) {
      try {
        const { data, error } = await client
          .from('working_copies')
          .select(currentWorkingCopyProjection)
          .eq('user_id', userId)
          .eq('application_id', applicationId)
          .maybeSingle()

        if (error) {
          throw error
        }

        return data === null ? null : parseCurrentWorkingCopySummary(data)
      } catch (error) {
        throw createRepositoryError(
          'find-current-working-copy',
          error instanceof z.ZodError
            ? 'unexpected-result'
            : 'provider-failure',
          error,
        )
      }
    },

    async findCurrentReview(applicationId) {
      try {
        const { data, error } = await client
          .from('working_copies')
          .select(currentWorkingCopyReviewProjection)
          .eq('user_id', userId)
          .eq('application_id', applicationId)
          .maybeSingle()

        if (error) {
          throw error
        }

        return data === null ? null : parseCurrentWorkingCopyReview(data)
      } catch (error) {
        throw createRepositoryError(
          'find-current-working-copy-review',
          error instanceof z.ZodError
            ? 'unexpected-result'
            : 'provider-failure',
          error,
        )
      }
    },

    async replaceCurrent(record) {
      let current: z.infer<typeof currentWorkingCopyRowSchema> | null

      try {
        const { data, error } = await client
          .from('working_copies')
          .select(currentWorkingCopyProjection)
          .eq('user_id', userId)
          .eq('application_id', record.applicationId)
          .maybeSingle()

        if (error) {
          throw error
        }

        current = data === null ? null : currentWorkingCopyRowSchema.parse(data)
      } catch (error) {
        throw createRepositoryError(
          'find-current-working-copy',
          error instanceof z.ZodError
            ? 'unexpected-result'
            : 'provider-failure',
          error,
        )
      }

      if (current?.state === 'accepted') {
        throw createRepositoryError(
          'replace-current-working-copy',
          'accepted-working-copy',
        )
      }

      const proposal = tailoringWorkingCopyProposalSchema.parse(record.proposal)
      const persistenceRecord = {
        change_summary: proposal.changeSummary,
        content_sha256: record.contentSha256,
        model_name: record.provenance.modelName,
        prompt_version: record.provenance.promptVersion,
        provider_name: record.provenance.providerName,
        source_base_resume_id: record.sourceBaseResumeId,
        source_interpretation_id: record.sourceInterpretationId,
        source_interpretation_sha256:
          record.provenance.sourceInterpretationSha256,
        source_resume_sha256: record.provenance.sourceResumeSha256,
        state: 'awaiting_review' as const,
        structured_content: { sections: proposal.sections },
        updated_at: record.updatedAt,
      }

      try {
        if (current === null) {
          const insert = {
            ...persistenceRecord,
            application_id: record.applicationId,
            user_id: userId,
          } satisfies Database['public']['Tables']['working_copies']['Insert']
          const { data, error } = await client
            .from('working_copies')
            .insert(insert)
            .select(currentWorkingCopyProjection)
            .single()

          if (error) {
            throw error
          }

          return toPersistedCurrentWorkingCopy(
            parseCurrentWorkingCopySummary(data),
          )
        }

        const update = {
          ...persistenceRecord,
          revision_number: current.revision_number + 1,
        } satisfies Database['public']['Tables']['working_copies']['Update']
        const { data, error } = await client
          .from('working_copies')
          .update(update)
          .eq('user_id', userId)
          .eq('id', current.id)
          .eq('state', 'awaiting_review')
          .select(currentWorkingCopyProjection)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          throw createRepositoryError(
            'replace-current-working-copy',
            'accepted-working-copy',
          )
        }

        return toPersistedCurrentWorkingCopy(
          parseCurrentWorkingCopySummary(data),
        )
      } catch (error) {
        if (error instanceof TailoringWorkingCopiesRepositoryError) {
          throw error
        }

        throw createRepositoryError(
          'replace-current-working-copy',
          error instanceof z.ZodError
            ? 'unexpected-result'
            : 'provider-failure',
          error,
        )
      }
    },
  }
}
