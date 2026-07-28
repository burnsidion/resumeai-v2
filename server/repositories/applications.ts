import {
  dashboardApplicationSummarySchema,
  dashboardRecentApplicationSchema,
  type DashboardApplicationSummary,
  type DashboardRecentApplication,
} from '../../shared/product-data/dashboard'
import type { ProductDataRepositoryContext } from './product-data/context'
import { withProductDataRepositoryError } from './product-data/errors'

export const ACTIVE_APPLICATION_STATUSES = [
  'draft',
  'applied',
  'interviewing',
  'offer',
] as const

export const RECENT_APPLICATION_LIMIT = 3

export interface ApplicationsRepository {
  getSummary(): Promise<DashboardApplicationSummary>
  listRecent(): Promise<ReadonlyArray<DashboardRecentApplication>>
}

const requireExactCount = (count: number | null): number => {
  if (count === null) {
    throw new Error('The exact row count was missing.')
  }

  return count
}

export function createApplicationsRepository({
  client,
  userId,
}: ProductDataRepositoryContext): ApplicationsRepository {
  return {
    getSummary: () =>
      withProductDataRepositoryError('read-application-summary', async () => {
        const [activeResult, interviewResult] = await Promise.all([
          client
            .from('applications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ACTIVE_APPLICATION_STATUSES),
          client
            .from('applications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'interviewing'),
        ])

        if (activeResult.error) {
          throw activeResult.error
        }

        if (interviewResult.error) {
          throw interviewResult.error
        }

        return dashboardApplicationSummarySchema.parse({
          activeCount: requireExactCount(activeResult.count),
          interviewCount: requireExactCount(interviewResult.count),
        })
      }),

    listRecent: () =>
      withProductDataRepositoryError('read-recent-applications', async () => {
        const { data, error } = await client
          .from('applications')
          .select(
            'id, company, role, status, applied_on, created_at, updated_at',
          )
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(RECENT_APPLICATION_LIMIT)

        if (error) {
          throw error
        }

        if (!data) {
          throw new Error('The recent application result was missing.')
        }

        return dashboardRecentApplicationSchema.array().parse(
          data.map((application) => ({
            appliedOn: application.applied_on,
            company: application.company,
            createdAt: application.created_at,
            id: application.id,
            role: application.role,
            status: application.status,
            updatedAt: application.updated_at,
          })),
        )
      }),
  }
}
