import type { BaseResumesReadEndpointErrorCode } from '../../../shared/base-resumes/errors'
import type { BaseResumesManagementViewModel } from '../../../shared/base-resumes/view-model'
import { createBaseResumesManagementViewModel } from '../../presentation/base-resumes-view-model'
import { ProductDataRepositoryError } from '../../repositories/product-data/errors'
import {
  BaseResumesProductDataServiceError,
  getBaseResumesProductData,
} from '../../services/base-resumes-product-data'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

const createBaseResumesReadEndpointError = (
  code: BaseResumesReadEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

export default defineEventHandler(
  async (event): Promise<BaseResumesManagementViewModel> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createBaseResumesReadEndpointError(
          'authentication-unavailable',
          503,
          'Base resume authentication is temporarily unavailable.',
        )
      }

      throw createBaseResumesReadEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    try {
      const productData = await getBaseResumesProductData({
        client,
        userId: authentication.user.id,
      })

      return createBaseResumesManagementViewModel(productData)
    } catch (error) {
      const temporarilyUnavailable =
        error instanceof ProductDataRepositoryError ||
        error instanceof BaseResumesProductDataServiceError

      throw createBaseResumesReadEndpointError(
        'base-resumes-unavailable',
        temporarilyUnavailable ? 503 : 500,
        temporarilyUnavailable
          ? 'Base resumes are temporarily unavailable.'
          : 'Base resumes could not be loaded.',
      )
    }
  },
)
