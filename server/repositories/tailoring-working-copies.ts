import { z } from 'zod'

import {
  tailoringWorkingCopyProposalSchema,
  type TailoringWorkingCopyProposal,
  type TailoringWorkingCopyProvenance,
} from '../domain/tailoring/working-copy'
import {
  tailoringWorkingCopySummarySchema,
  type TailoringWorkingCopySummary,
} from '../../shared/tailoring/status'
import type { Database } from '../infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from './product-data/context'

const currentWorkingCopyProjection =
  'id,state,revision_number,updated_at' as const
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

export type TailoringWorkingCopiesRepositoryOperation =
  'find-current-working-copy' | 'replace-current-working-copy'

export type TailoringWorkingCopiesRepositoryErrorKind =
  'accepted-working-copy' | 'provider-failure' | 'unexpected-result'

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
  findCurrent(
    applicationId: string,
  ): Promise<TailoringWorkingCopySummary | null>
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

export function createTailoringWorkingCopiesRepository({
  client,
  userId,
}: ProductDataRepositoryContext): TailoringWorkingCopiesRepository {
  return {
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
