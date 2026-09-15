import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import applicationDeletionEndpoint from '../../server/api/applications/[id].delete'
import { ApplicationManagementServiceError } from '../../server/services/application-management'
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
    getRouterParam: (event: H3Event, name: string) =>
      (
        event.context.params as Record<string, string | undefined> | undefined
      )?.[name],
  })

  return {
    createAuthenticationServerClient: vi.fn(),
    deleteApplication: vi.fn(),
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
  '../../server/services/application-management',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../server/services/application-management')
      >()

    return {
      ...original,
      deleteApplication: mocks.deleteApplication,
    }
  },
)

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'

const createEvent = (id: string | null = applicationId): H3Event =>
  ({
    context: {
      params: id === null ? {} : { id },
    },
    method: 'DELETE',
    node: {
      req: { method: 'DELETE', url: `/api/applications/${id ?? ''}` },
      res: {},
    },
    path: `/api/applications/${id ?? ''}`,
  }) as H3Event

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

  throw new Error('Expected the application deletion endpoint to fail.')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createAuthenticationServerClient.mockReturnValue(client)
  mocks.deleteApplication.mockResolvedValue(applicationId)
  mocks.resolveAuthenticatedUser.mockResolvedValue({
    authenticated: true,
    user: {
      email: 'person@example.com',
      id: userId,
    },
  })
})

describe('application deletion endpoint', () => {
  it('deletes one application through one trusted request-scoped client', async () => {
    const event = createEvent()

    await expect(applicationDeletionEndpoint(event)).resolves.toEqual({
      application: { id: applicationId },
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.deleteApplication).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
    )
  })

  it('rejects an unauthenticated deletion before product work', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expectEndpointFailure(
      () => applicationDeletionEndpoint(createEvent()),
      {
        code: 'authentication-required',
        statusCode: 401,
        statusMessage: 'Authentication is required.',
      },
    )

    expect(mocks.deleteApplication).not.toHaveBeenCalled()
  })

  it.each([null, '', 'not-a-uuid'])(
    'rejects an invalid ID without invoking the deletion service: %s',
    async (id) => {
      await expectEndpointFailure(
        () => applicationDeletionEndpoint(createEvent(id)),
        {
          code: 'invalid-application-id',
          statusCode: 400,
          statusMessage: 'A valid application ID is required.',
        },
      )

      expect(mocks.deleteApplication).not.toHaveBeenCalled()
    },
  )

  it('maps missing and cross-owner applications to one unavailable result', async () => {
    mocks.deleteApplication.mockRejectedValue(
      new ApplicationManagementServiceError('application-unavailable'),
    )

    await expectEndpointFailure(
      () => applicationDeletionEndpoint(createEvent()),
      {
        code: 'application-unavailable',
        statusCode: 404,
        statusMessage: 'The application is unavailable.',
      },
    )
  })

  it('maps persistence failures to a recoverable sanitized response', async () => {
    mocks.deleteApplication.mockRejectedValue(
      new ApplicationManagementServiceError(
        'persistence-unavailable',
        new Error(providerMessage),
      ),
    )

    await expectEndpointFailure(
      () => applicationDeletionEndpoint(createEvent()),
      {
        code: 'application-deletion-unavailable',
        statusCode: 503,
        statusMessage: 'Application deletion is temporarily unavailable.',
      },
    )
  })

  it('sanitizes unexpected deletion failures', async () => {
    mocks.deleteApplication.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(
      () => applicationDeletionEndpoint(createEvent()),
      {
        code: 'application-deletion-unavailable',
        statusCode: 500,
        statusMessage: 'The application could not be deleted.',
      },
    )
  })
})
