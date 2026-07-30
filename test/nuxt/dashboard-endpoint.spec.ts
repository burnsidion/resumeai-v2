import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DashboardProductData } from '../../shared/product-data/dashboard'
import dashboardEndpoint from '../../server/api/dashboard.get'
import { DashboardProductDataServiceError } from '../../server/services/dashboard-product-data'
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
    getDashboardProductData: vi.fn(),
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
  '../../server/services/dashboard-product-data',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../server/services/dashboard-product-data')
      >()

    return {
      ...original,
      getDashboardProductData: mocks.getDashboardProductData,
    }
  },
)

const userId = '7bd6a80d-1a72-47b7-b55f-60a55507fd2a'
const client = {} as ServerSupabaseClient

const zeroProductData: DashboardProductData = {
  applicationSummary: {
    activeCount: 0,
    interviewCount: 0,
  },
  baseResumes: {
    activeCount: 0,
    activeLimit: 3,
    items: [],
  },
  readyForReview: null,
  recentApplications: [],
}

const createEvent = (): H3Event =>
  ({ context: {}, path: '/api/dashboard' }) as H3Event

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
      data: {
        code: expected.code,
      },
      statusCode: expected.statusCode,
      statusMessage: expected.statusMessage,
    })
    expect(JSON.stringify(error)).not.toContain('Sensitive provider details')
    return
  }

  throw new Error('Expected the dashboard endpoint to fail.')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createAuthenticationServerClient.mockReturnValue(client)
})

describe('dashboard endpoint', () => {
  it('uses one request-scoped client for trusted identity and owner-scoped product data', async () => {
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
    mocks.getDashboardProductData.mockResolvedValue(zeroProductData)

    await expect(dashboardEndpoint(event)).resolves.toMatchObject({
      attention: {
        kind: 'guidance',
        title: 'Add a base resume',
      },
      summary: {
        activeApplicationCount: 0,
        heading: 'Welcome back.',
      },
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledOnce()
    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.getDashboardProductData).toHaveBeenCalledOnce()
    expect(mocks.getDashboardProductData).toHaveBeenCalledWith({
      client,
      userId,
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

    await expectEndpointFailure(() => dashboardEndpoint(event), {
      code: 'authentication-required',
      statusCode: 401,
      statusMessage: 'Authentication is required.',
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.getDashboardProductData).not.toHaveBeenCalled()
  })

  it('distinguishes temporary authentication unavailability', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'service-unavailable',
        message: 'Sensitive provider details',
      },
    })

    await expectEndpointFailure(() => dashboardEndpoint(createEvent()), {
      code: 'authentication-unavailable',
      statusCode: 503,
      statusMessage: 'Dashboard authentication is temporarily unavailable.',
    })

    expect(mocks.getDashboardProductData).not.toHaveBeenCalled()
  })

  it('maps sanitized product-data failures to a recoverable response', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: true,
      user: {
        email: 'person@example.com',
        id: userId,
      },
    })
    mocks.getDashboardProductData.mockRejectedValue(
      new DashboardProductDataServiceError(
        new Error('Sensitive provider details'),
      ),
    )

    await expectEndpointFailure(() => dashboardEndpoint(createEvent()), {
      code: 'dashboard-unavailable',
      statusCode: 503,
      statusMessage: 'Dashboard data is temporarily unavailable.',
    })
  })

  it('sanitizes unexpected response-mapping failures', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: true,
      user: {
        email: 'person@example.com',
        id: userId,
      },
    })
    mocks.getDashboardProductData.mockResolvedValue({
      ...zeroProductData,
      applicationSummary: {
        activeCount: -1,
        interviewCount: 0,
        sensitive: 'Sensitive provider details',
      },
    })

    await expectEndpointFailure(() => dashboardEndpoint(createEvent()), {
      code: 'dashboard-unavailable',
      statusCode: 500,
      statusMessage: 'Dashboard data could not be loaded.',
    })
  })
})
