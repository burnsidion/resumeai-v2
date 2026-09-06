import { z } from 'zod'

import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
  type ActiveBaseResumeSlot,
} from '../../shared/base-resumes/upload'
import type { ProductDataRepositoryContext } from './product-data/context'

const selectableBaseResumeProjection =
  'id,original_filename,active_slot,retired_at' as const

const selectableBaseResumeRowSchema = z
  .object({
    active_slot: activeBaseResumeSlotSchema,
    id: z.uuid(),
    original_filename: baseResumeOriginalFilenameSchema,
    retired_at: z.null(),
  })
  .strict()

export interface SelectableBaseResume {
  activeSlot: ActiveBaseResumeSlot
  id: string
  originalFilename: string
}

export interface ApplicationResumeSelectionRepository {
  findAvailableById(id: string): Promise<SelectableBaseResume | null>
}

export type ApplicationResumeSelectionRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export class ApplicationResumeSelectionRepositoryError extends Error {
  readonly code = 'application-resume-selection-unavailable'

  constructor(
    readonly kind: ApplicationResumeSelectionRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Application resume selection is temporarily unavailable.', {
      cause,
    })
    this.name = 'ApplicationResumeSelectionRepositoryError'
  }
}

const createRepositoryError = (
  cause: unknown,
  kind: ApplicationResumeSelectionRepositoryErrorKind = 'provider-failure',
): ApplicationResumeSelectionRepositoryError =>
  new ApplicationResumeSelectionRepositoryError(kind, cause)

export function createApplicationResumeSelectionRepository({
  client,
  userId,
}: ProductDataRepositoryContext): ApplicationResumeSelectionRepository {
  return {
    async findAvailableById(id) {
      try {
        const { data, error } = await client
          .from('base_resumes')
          .select(selectableBaseResumeProjection)
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
          const row = selectableBaseResumeRowSchema.parse(data)

          return {
            activeSlot: row.active_slot,
            id: row.id,
            originalFilename: row.original_filename,
          }
        } catch (error) {
          throw createRepositoryError(error, 'unexpected-result')
        }
      } catch (error) {
        if (error instanceof ApplicationResumeSelectionRepositoryError) {
          throw error
        }

        throw createRepositoryError(error)
      }
    },
  }
}
