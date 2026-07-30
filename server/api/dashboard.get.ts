import type { DashboardEndpointErrorCode } from '../../shared/dashboard/errors'
import type { DashboardViewModel } from '../../shared/dashboard/view-model'
import { createDashboardViewModel } from '../presentation/dashboard-view-model'
import { ProductDataRepositoryError } from '../repositories/product-data/errors'
import {
  DashboardProductDataServiceError,
  getDashboardProductData,
} from '../services/dashboard-product-data'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../utils/authentication/user'

const createDashboardEndpointError = (
  code: DashboardEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

export default defineEventHandler(
  async (event): Promise<DashboardViewModel> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createDashboardEndpointError(
          'authentication-unavailable',
          503,
          'Dashboard authentication is temporarily unavailable.',
        )
      }

      throw createDashboardEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    try {
      const productData = await getDashboardProductData({
        client,
        userId: authentication.user.id,
      })

      return createDashboardViewModel(productData)
    } catch (error) {
      const serviceUnavailable =
        error instanceof ProductDataRepositoryError ||
        error instanceof DashboardProductDataServiceError

      throw createDashboardEndpointError(
        'dashboard-unavailable',
        serviceUnavailable ? 503 : 500,
        serviceUnavailable
          ? 'Dashboard data is temporarily unavailable.'
          : 'Dashboard data could not be loaded.',
      )
    }
  },
)
