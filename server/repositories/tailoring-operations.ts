import { z } from 'zod'

import type { Database } from '../infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from './product-data/context'

const operationProjection = 'id,application_id,lease_expires_at' as const
const timestampSchema = z.iso.datetime({ offset: true })

const operationRowSchema = z
  .object({
    application_id: z.uuid(),
    id: z.uuid(),
    lease_expires_at: timestampSchema,
  })
  .strict()

export interface TailoringOperation {
  applicationId: string
  id: string
  leaseExpiresAt: string
}

export interface AcquireTailoringOperationRecord {
  applicationId: string
  expiredAt: string
  leaseExpiresAt: string
}

export type TailoringOperationsRepositoryOperation =
  'acquire-tailoring-operation' | 'release-tailoring-operation'

export type TailoringOperationsRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export class TailoringOperationsRepositoryError extends Error {
  readonly code = 'tailoring-operation-persistence-unavailable'

  constructor(
    readonly operation: TailoringOperationsRepositoryOperation,
    readonly kind: TailoringOperationsRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Tailoring coordination is temporarily unavailable.', { cause })
    this.name = 'TailoringOperationsRepositoryError'
  }
}

export interface TailoringOperationsRepository {
  acquire(
    record: AcquireTailoringOperationRecord,
  ): Promise<TailoringOperation | null>
  release(id: string): Promise<void>
}

interface ProviderErrorShape {
  code?: unknown
}

const isOperationConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as ProviderErrorShape).code === '23505'

const createRepositoryError = (
  operation: TailoringOperationsRepositoryOperation,
  cause: unknown,
  kind: TailoringOperationsRepositoryErrorKind = 'provider-failure',
): TailoringOperationsRepositoryError =>
  new TailoringOperationsRepositoryError(operation, kind, cause)

const parseOperation = (data: unknown): TailoringOperation => {
  const row = operationRowSchema.parse(data)

  return {
    applicationId: row.application_id,
    id: row.id,
    leaseExpiresAt: row.lease_expires_at,
  }
}

export function createTailoringOperationsRepository({
  client,
  userId,
}: ProductDataRepositoryContext): TailoringOperationsRepository {
  return {
    async acquire(record) {
      try {
        const { error: expiredOperationError } = await client
          .from('tailoring_operations')
          .delete()
          .eq('user_id', userId)
          .eq('application_id', record.applicationId)
          .lte('lease_expires_at', record.expiredAt)

        if (expiredOperationError) {
          throw expiredOperationError
        }

        const insert = {
          application_id: record.applicationId,
          lease_expires_at: record.leaseExpiresAt,
          user_id: userId,
        } satisfies Database['public']['Tables']['tailoring_operations']['Insert']
        const { data, error } = await client
          .from('tailoring_operations')
          .insert(insert)
          .select(operationProjection)
          .single()

        if (error) {
          if (isOperationConflict(error)) {
            return null
          }

          throw error
        }

        try {
          return parseOperation(data)
        } catch (error) {
          throw createRepositoryError(
            'acquire-tailoring-operation',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof TailoringOperationsRepositoryError) {
          throw error
        }

        throw createRepositoryError('acquire-tailoring-operation', error)
      }
    },

    async release(id) {
      try {
        const { error } = await client
          .from('tailoring_operations')
          .delete()
          .eq('user_id', userId)
          .eq('id', id)

        if (error) {
          throw error
        }
      } catch (error) {
        throw createRepositoryError('release-tailoring-operation', error)
      }
    },
  }
}
