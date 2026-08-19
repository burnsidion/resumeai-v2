import { z } from 'zod'

import {
  retiredBaseResumeSchema,
  type RetiredBaseResume,
} from '../../shared/base-resumes/retirement'
import {
  activeBaseResumeSlotSchema,
  type ActiveBaseResumeSlot,
} from '../../shared/base-resumes/upload'
import type { Database } from '../infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from './product-data/context'

const baseResumeRetirementProjection = 'id,active_slot,retired_at' as const

const activeBaseResumeLifecycleRowSchema = z
  .object({
    active_slot: activeBaseResumeSlotSchema,
    id: z.uuid(),
    retired_at: z.null(),
  })
  .strict()

const retiredBaseResumeLifecycleRowSchema = z
  .object({
    active_slot: z.null(),
    id: z.uuid(),
    retired_at: z.iso.datetime({ offset: true }),
  })
  .strict()

const baseResumeLifecycleRowSchema = z.union([
  activeBaseResumeLifecycleRowSchema,
  retiredBaseResumeLifecycleRowSchema,
])

export type BaseResumeRetirementRepositoryOperation =
  'find-base-resume-lifecycle' | 'retire-base-resume'

export type BaseResumeRetirementRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export type BaseResumeLifecycleState =
  | {
      activeSlot: ActiveBaseResumeSlot
      id: string
      retiredAt: null
      state: 'active'
    }
  | {
      activeSlot: null
      id: string
      retiredAt: string
      state: 'retired'
    }

export interface BaseResumeRetirementRepository {
  findLifecycleById(id: string): Promise<BaseResumeLifecycleState | null>
  retire(id: string, retiredAt: string): Promise<RetiredBaseResume | null>
}

export class BaseResumeRetirementRepositoryError extends Error {
  readonly code = 'base-resume-retirement-unavailable'

  constructor(
    readonly operation: BaseResumeRetirementRepositoryOperation,
    readonly kind: BaseResumeRetirementRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Base resume retirement is temporarily unavailable.', { cause })
    this.name = 'BaseResumeRetirementRepositoryError'
  }
}

const createRepositoryError = (
  operation: BaseResumeRetirementRepositoryOperation,
  cause: unknown,
  kind: BaseResumeRetirementRepositoryErrorKind = 'provider-failure',
): BaseResumeRetirementRepositoryError =>
  new BaseResumeRetirementRepositoryError(operation, kind, cause)

const parseRetiredBaseResume = (data: unknown): RetiredBaseResume => {
  const row = retiredBaseResumeLifecycleRowSchema.parse(data)

  return retiredBaseResumeSchema.parse({
    id: row.id,
    retiredAt: row.retired_at,
  })
}

const parseBaseResumeLifecycle = (data: unknown): BaseResumeLifecycleState => {
  const row = baseResumeLifecycleRowSchema.parse(data)

  if (row.retired_at === null) {
    return {
      activeSlot: row.active_slot,
      id: row.id,
      retiredAt: null,
      state: 'active',
    }
  }

  return {
    activeSlot: null,
    id: row.id,
    retiredAt: row.retired_at,
    state: 'retired',
  }
}

export function createBaseResumeRetirementRepository({
  client,
  userId,
}: ProductDataRepositoryContext): BaseResumeRetirementRepository {
  return {
    async retire(id, retiredAt) {
      try {
        const update = {
          active_slot: null,
          retired_at: retiredAt,
        } satisfies Database['public']['Tables']['base_resumes']['Update']
        const { data, error } = await client
          .from('base_resumes')
          .update(update)
          .eq('user_id', userId)
          .eq('id', id)
          .not('active_slot', 'is', null)
          .is('retired_at', null)
          .select(baseResumeRetirementProjection)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parseRetiredBaseResume(data)
        } catch (error) {
          throw createRepositoryError(
            'retire-base-resume',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof BaseResumeRetirementRepositoryError) {
          throw error
        }

        throw createRepositoryError('retire-base-resume', error)
      }
    },

    async findLifecycleById(id) {
      try {
        const { data, error } = await client
          .from('base_resumes')
          .select(baseResumeRetirementProjection)
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
          return parseBaseResumeLifecycle(data)
        } catch (error) {
          throw createRepositoryError(
            'find-base-resume-lifecycle',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof BaseResumeRetirementRepositoryError) {
          throw error
        }

        throw createRepositoryError('find-base-resume-lifecycle', error)
      }
    },
  }
}
