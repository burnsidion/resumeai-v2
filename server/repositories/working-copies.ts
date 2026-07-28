import {
  dashboardReadyForReviewSchema,
  type DashboardReadyForReview,
} from '../../shared/product-data/dashboard'
import type { ProductDataRepositoryContext } from './product-data/context'
import { withProductDataRepositoryError } from './product-data/errors'

export interface WorkingCopiesRepository {
  findReadyForReview(): Promise<DashboardReadyForReview | null>
}

export function createWorkingCopiesRepository({
  client,
  userId,
}: ProductDataRepositoryContext): WorkingCopiesRepository {
  return {
    findReadyForReview: () =>
      withProductDataRepositoryError('read-ready-for-review', async () => {
        const { data, error } = await client
          .from('working_copies')
          .select(
            `
              id,
              application_id,
              state,
              updated_at,
              application:applications!working_copies_application_fkey (
                company,
                role
              )
            `,
          )
          .eq('user_id', userId)
          .eq('state', 'awaiting_review')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (!data) {
          return null
        }

        return dashboardReadyForReviewSchema.parse({
          applicationId: data.application_id,
          company: data.application.company,
          role: data.application.role,
          state: data.state,
          updatedAt: data.updated_at,
          workingCopyId: data.id,
        })
      }),
  }
}
