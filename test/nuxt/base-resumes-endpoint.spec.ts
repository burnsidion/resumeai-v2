import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseResumesManagementData } from '../../shared/product-data/base-resumes'
import baseResumesEndpoint from '../../server/api/base-resumes/index.get'
import { ProductDataRepositoryError } from '../../server/repositories/product-data/errors'
import { BaseResumesProductDataServiceError } from '../../server/services/base-resumes-product-data'
import type { ServerSupabaseClient } from '../../server/utils/authentication/supabase'

const mocks = vi.hoisted(() => {
  const createError = (input: {
    data: unknown
    statusCode: number
    statusMessage: string
  }) => Object.assign(new Error(input.statusMessage), input)

  Object.assign(globalThis, {
    createError,
    defineEventHandler: <T>(handler: T): T => handler,
  })

  return {
    createAuthenticationServerClient: vi.fn(),
    getBaseResumesProductData: vi.fn(),
    markAuthenticationResponsePrivate: vi.fn(),
    resolveAuthenticatedUser: vi.fn(),
  }
})

vi.mock('../../server/utils/authentication/supabase', () => ({
  createAuthenticationServerClient: mocks.createAuthenticationServerClient,
  markAuthenticationResponsePrivate: mocks.markAuthenticationResponsePrivate,
}))

vi.mock('../../server/utils/authentication/user', () => ({
  resolveAuthenticatedUser: mocks.resolveAuthenticatedUser,
}))

vi.mock(
  '../../server/services/base-resumes-product-data',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../server/services/base-resumes-product-data')
      >()

    return {
      ...original,
      getBaseResumesProductData: mocks.getBaseResumesProductData,
    }
  },
)

const userId = '7bd6a80d-1a72-47b7-b55f-60a55507fd2a'
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'

const populatedProductData: BaseResumesManagementData = {
  activeCount: 2,
  activeLimit: 3,
  items: [
    {
      activeSlot: 1,
      createdAt: '2026-08-08T18:00:00+00:00',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      originalFilename: 'Frontend Engineering.pdf',
      sizeBytes: 493_568,
    },
    {
      activeSlot: 2,
      createdAt: '2026-08-02T18:00:00+00:00',
      id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
      originalFilename: 'Accessibility Specialist.pdf',
      sizeBytes: 629_760,
    },
  ],
}

const createEvent = (): H3Event =>
  ({ context: {}, path: '/api/base-resumes' }) as H3Event

const expectEndpointFailure = async (
  request: () => Promise<unknown>,
  expected: {
    code: string
    statusCode: number
    statusMessage: string
  },
): Promise<void> => {
  try {
    await request()
  } catch (error) {
    expect(error).toMatchObject({
      data: { code: expected.code },
      statusCode: expected.statusCode,
      statusMessage: expected.statusMessage,
    })
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the Base Resumes endpoint to fail.')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createAuthenticationServerClient.mockReturnValue(client)
  mocks.resolveAuthenticatedUser.mockResolvedValue({
    authenticated: true,
    user: {
      email: 'person@example.com',
      id: userId,
    },
  })
  mocks.getBaseResumesProductData.mockResolvedValue(populatedProductData)
})

describe('Base Resumes read endpoint', () => {
  it('uses one request-scoped client for trusted identity and owner-scoped data', async () => {
    const event = createEvent()

    mocks.resolveAuthenticatedUser.mockImplementation(
      async (
        receivedEvent: H3Event,
        dependencies: { createClient: () => ServerSupabaseClient },
      ) => {
        expect(receivedEvent).toBe(event)
        expect(dependencies.createClient()).toBe(client)

        return {
          authenticated: true,
          user: {
            email: 'person@example.com',
            id: userId,
          },
        }
      },
    )

    await expect(baseResumesEndpoint(event)).resolves.toMatchObject({
      activeCount: 2,
      activeLimit: 3,
      capacityLabel: '2 of 3 resumes',
      capacityStatusLabel: 'One slot available',
      items: [
        {
          activeSlot: 1,
          fileSizeLabel: '482 KiB',
          filename: 'Frontend Engineering.pdf',
          uploadedLabel: 'Uploaded August 8, 2026',
        },
        {
          activeSlot: 2,
          fileSizeLabel: '615 KiB',
          filename: 'Accessibility Specialist.pdf',
          uploadedLabel: 'Uploaded August 2, 2026',
        },
      ],
      remainingSlots: 1,
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledOnce()
    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.getBaseResumesProductData).toHaveBeenCalledOnce()
    expect(mocks.getBaseResumesProductData).toHaveBeenCalledWith({
      client,
      userId,
    })
  })

  it('returns the zero state as successful data', async () => {
    mocks.getBaseResumesProductData.mockResolvedValue({
      activeCount: 0,
      activeLimit: 3,
      items: [],
    })

    await expect(baseResumesEndpoint(createEvent())).resolves.toEqual({
      activeCount: 0,
      activeCountLabel: '0 active',
      activeLimit: 3,
      capacityAriaLabel: 'Zero of three active resume slots used',
      capacityLabel: '0 of 3 resumes',
      capacityStatusLabel: 'Three slots available',
      items: [],
      remainingSlots: 3,
    })
  })

  it('rejects unauthenticated requests without reading product data', async () => {
    const event = createEvent()

    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expectEndpointFailure(() => baseResumesEndpoint(event), {
      code: 'authentication-required',
      statusCode: 401,
      statusMessage: 'Authentication is required.',
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.getBaseResumesProductData).not.toHaveBeenCalled()
  })

  it('distinguishes temporary authentication unavailability', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'service-unavailable',
        message: providerMessage,
      },
    })

    await expectEndpointFailure(() => baseResumesEndpoint(createEvent()), {
      code: 'authentication-unavailable',
      statusCode: 503,
      statusMessage: 'Base resume authentication is temporarily unavailable.',
    })

    expect(mocks.getBaseResumesProductData).not.toHaveBeenCalled()
  })

  it.each([
    new ProductDataRepositoryError(
      'read-active-base-resumes-management',
      new Error(providerMessage),
    ),
    new BaseResumesProductDataServiceError(new Error(providerMessage)),
  ])(
    'maps a sanitized product-data failure to a recoverable response',
    async (error) => {
      mocks.getBaseResumesProductData.mockRejectedValue(error)

      await expectEndpointFailure(() => baseResumesEndpoint(createEvent()), {
        code: 'base-resumes-unavailable',
        statusCode: 503,
        statusMessage: 'Base resumes are temporarily unavailable.',
      })
    },
  )

  it('sanitizes unexpected response-mapping failures', async () => {
    mocks.getBaseResumesProductData.mockResolvedValue({
      ...populatedProductData,
      activeCount: -1,
      sensitive: providerMessage,
    })

    await expectEndpointFailure(() => baseResumesEndpoint(createEvent()), {
      code: 'base-resumes-unavailable',
      statusCode: 500,
      statusMessage: 'Base resumes could not be loaded.',
    })
  })
})
