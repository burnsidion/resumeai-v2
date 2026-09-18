import { z } from 'zod'

import {
  resumeInterpretationStructuredContentSchema,
  type ResumeInterpretationStructuredContent,
} from '../domain/resume-interpretations/contracts'
import type { ProductDataRepositoryContext } from './product-data/context'

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const timestampSchema = z.iso.datetime({ offset: true })

const resumeInterpretationProjection =
  'id,base_resume_id,source_resume_sha256,interpreter_name,interpreter_version,schema_version,structured_content,content_sha256,created_at' as const

const resumeInterpretationRowSchema = z
  .object({
    base_resume_id: z.uuid(),
    content_sha256: sha256Schema,
    created_at: timestampSchema,
    id: z.uuid(),
    interpreter_name: z.string().trim().min(1),
    interpreter_version: z.string().trim().min(1),
    schema_version: z.number().int().positive(),
    source_resume_sha256: sha256Schema,
    structured_content: resumeInterpretationStructuredContentSchema,
  })
  .strict()

export interface ResumeInterpretationIdentity {
  baseResumeId: string
  interpreterName: string
  interpreterVersion: string
  schemaVersion: number
  sourceResumeSha256: string
}

export interface CreateResumeInterpretationRecord extends ResumeInterpretationIdentity {
  contentSha256: string
  structuredContent: ResumeInterpretationStructuredContent
}

export interface PersistedResumeInterpretation extends CreateResumeInterpretationRecord {
  createdAt: string
  id: string
}

export type ResumeInterpretationsRepositoryOperation =
  'create-resume-interpretation' | 'find-resume-interpretation'

export type ResumeInterpretationsRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export class ResumeInterpretationsRepositoryError extends Error {
  readonly code = 'resume-interpretation-persistence-unavailable'

  constructor(
    readonly operation: ResumeInterpretationsRepositoryOperation,
    readonly kind: ResumeInterpretationsRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Resume interpretation data is temporarily unavailable.', { cause })
    this.name = 'ResumeInterpretationsRepositoryError'
  }
}

export interface ResumeInterpretationsRepository {
  create(
    record: CreateResumeInterpretationRecord,
  ): Promise<PersistedResumeInterpretation>
  findByIdentity(
    identity: ResumeInterpretationIdentity,
  ): Promise<PersistedResumeInterpretation | null>
}

const createRepositoryError = (
  operation: ResumeInterpretationsRepositoryOperation,
  kind: ResumeInterpretationsRepositoryErrorKind,
  cause: unknown,
): ResumeInterpretationsRepositoryError =>
  new ResumeInterpretationsRepositoryError(operation, kind, cause)

const parsePersistedInterpretation = (
  data: unknown,
): PersistedResumeInterpretation => {
  const row = resumeInterpretationRowSchema.parse(data)

  return {
    baseResumeId: row.base_resume_id,
    contentSha256: row.content_sha256,
    createdAt: row.created_at,
    id: row.id,
    interpreterName: row.interpreter_name,
    interpreterVersion: row.interpreter_version,
    schemaVersion: row.schema_version,
    sourceResumeSha256: row.source_resume_sha256,
    structuredContent: row.structured_content,
  }
}

export function createResumeInterpretationsRepository({
  client,
  userId,
}: ProductDataRepositoryContext): ResumeInterpretationsRepository {
  return {
    async create(record) {
      try {
        const { data, error } = await client
          .from('resume_interpretations')
          .insert({
            base_resume_id: record.baseResumeId,
            content_sha256: record.contentSha256,
            interpreter_name: record.interpreterName,
            interpreter_version: record.interpreterVersion,
            schema_version: record.schemaVersion,
            source_resume_sha256: record.sourceResumeSha256,
            structured_content: record.structuredContent,
            user_id: userId,
          })
          .select(resumeInterpretationProjection)
          .single()

        if (error) {
          throw error
        }

        try {
          return parsePersistedInterpretation(data)
        } catch (error) {
          throw createRepositoryError(
            'create-resume-interpretation',
            'unexpected-result',
            error,
          )
        }
      } catch (error) {
        if (error instanceof ResumeInterpretationsRepositoryError) {
          throw error
        }

        throw createRepositoryError(
          'create-resume-interpretation',
          'provider-failure',
          error,
        )
      }
    },

    async findByIdentity(identity) {
      try {
        const { data, error } = await client
          .from('resume_interpretations')
          .select(resumeInterpretationProjection)
          .eq('user_id', userId)
          .eq('base_resume_id', identity.baseResumeId)
          .eq('source_resume_sha256', identity.sourceResumeSha256)
          .eq('interpreter_name', identity.interpreterName)
          .eq('interpreter_version', identity.interpreterVersion)
          .eq('schema_version', identity.schemaVersion)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parsePersistedInterpretation(data)
        } catch (error) {
          throw createRepositoryError(
            'find-resume-interpretation',
            'unexpected-result',
            error,
          )
        }
      } catch (error) {
        if (error instanceof ResumeInterpretationsRepositoryError) {
          throw error
        }

        throw createRepositoryError(
          'find-resume-interpretation',
          'provider-failure',
          error,
        )
      }
    },
  }
}
