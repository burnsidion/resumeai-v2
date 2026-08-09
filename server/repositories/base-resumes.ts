import {
  dashboardBaseResumesSchema,
  type DashboardBaseResumes,
} from '../../shared/product-data/dashboard'
import {
  baseResumesManagementDataSchema,
  type BaseResumesManagementData,
} from '../../shared/product-data/base-resumes'
import type { ProductDataRepositoryContext } from './product-data/context'
import { withProductDataRepositoryError } from './product-data/errors'

export const ACTIVE_BASE_RESUME_LIMIT = 3

export interface BaseResumesRepository {
  getActive(): Promise<DashboardBaseResumes>
}

export interface BaseResumesManagementRepository {
  getActiveForManagement(): Promise<BaseResumesManagementData>
}

export function createBaseResumesRepository({
  client,
  userId,
}: ProductDataRepositoryContext): BaseResumesRepository {
  return {
    getActive: () =>
      withProductDataRepositoryError('read-active-base-resumes', async () => {
        const { count, data, error } = await client
          .from('base_resumes')
          .select('id, original_filename, active_slot, created_at', {
            count: 'exact',
          })
          .eq('user_id', userId)
          .not('active_slot', 'is', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(ACTIVE_BASE_RESUME_LIMIT)

        if (error) {
          throw error
        }

        if (count === null || !data) {
          throw new Error('The active base resume result was incomplete.')
        }

        return dashboardBaseResumesSchema.parse({
          activeCount: count,
          activeLimit: ACTIVE_BASE_RESUME_LIMIT,
          items: data.map((resume) => ({
            activeSlot: resume.active_slot,
            createdAt: resume.created_at,
            id: resume.id,
            originalFilename: resume.original_filename,
          })),
        })
      }),
  }
}

export function createBaseResumesManagementRepository({
  client,
  userId,
}: ProductDataRepositoryContext): BaseResumesManagementRepository {
  return {
    getActiveForManagement: () =>
      withProductDataRepositoryError(
        'read-active-base-resumes-management',
        async () => {
          const { count, data, error } = await client
            .from('base_resumes')
            .select(
              'id, original_filename, active_slot, created_at, size_bytes',
              { count: 'exact' },
            )
            .eq('user_id', userId)
            .not('active_slot', 'is', null)
            .is('retired_at', null)
            .order('active_slot', { ascending: true })
            .order('id', { ascending: true })
            .limit(ACTIVE_BASE_RESUME_LIMIT)

          if (error) {
            throw error
          }

          if (count === null || !data) {
            throw new Error(
              'The active base resume management result was incomplete.',
            )
          }

          return baseResumesManagementDataSchema.parse({
            activeCount: count,
            activeLimit: ACTIVE_BASE_RESUME_LIMIT,
            items: data.map((resume) => ({
              activeSlot: resume.active_slot,
              createdAt: resume.created_at,
              id: resume.id,
              originalFilename: resume.original_filename,
              sizeBytes: resume.size_bytes,
            })),
          })
        },
      ),
  }
}
