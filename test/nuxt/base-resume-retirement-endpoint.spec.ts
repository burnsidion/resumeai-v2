import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import baseResumeRetirementEndpoint from '../../server/api/base-resumes/[id]/retire.post'
import { BaseResumeRetirementServiceError } from '../../server/services/retire-base-resume'
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
    markAuthenticationResponsePrivate: vi.fn(),
    resolveAuthenticatedUser: vi.fn(),
    retireBaseResume: vi.fn(),
  }
})

vi.mock('../../server/utils/authentication/supabase', () => ({
  createAuthenticationServerClient: mocks.createAuthenticationServerClient,
  markAuthenticationResponsePrivate: mocks.markAuthenticationResponsePrivate,
}))

vi.mock('../../server/utils/authentication/user', () => ({
  resolveAuthenticatedUser: mocks.resolveAuthenticatedUser,
}))

vi.mock('../../server/services/retire-base-resume', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../server/services/retire-base-resume')
    >()

  return {
    ...original,
    retireBaseResume: mocks.retireBaseResume,
  }
})

const userId = '4f384f77-8482-4262-9bcb-f37439e0cc8a'
const baseResumeId = 'be87b7cb-e959-4be1-b29a-8c4dd1203b56'
const retiredAt = '2026-08-19T04:30:00.000Z'
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'

const createEvent = (id: string | null = baseResumeId): H3Event =>
  ({
    context: {
      params: id === null ? {} : { id },
    },
    path: id ? `/api/base-resumes/${id}/retire` : '/api/base-resumes//retire',
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

  throw new Error('Expected the base-resume retirement endpoint to fail.')
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
  mocks.retireBaseResume.mockResolvedValue({ id: baseResumeId, retiredAt })
})

describe('base-resume retirement endpoint', () => {
  it('uses one trusted client and returns the safe retirement representation', async () => {
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

    await expect(baseResumeRetirementEndpoint(event)).resolves.toEqual({
      baseResume: { id: baseResumeId, retiredAt },
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.retireBaseResume).toHaveBeenCalledOnce()
    expect(mocks.retireBaseResume).toHaveBeenCalledWith(
      { client, userId },
      baseResumeId,
    )
  })

  it.each([null, '', 'not-a-uuid'])(
    'rejects an invalid route ID without invoking the service: %s',
    async (id) => {
      await expectEndpointFailure(
        () => baseResumeRetirementEndpoint(createEvent(id)),
        {
          code: 'invalid-base-resume-id',
          statusCode: 400,
          statusMessage: 'A valid base resume ID is required.',
        },
      )

      expect(mocks.retireBaseResume).not.toHaveBeenCalled()
    },
  )

  it('rejects unauthenticated requests before validating or retiring a resume', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expectEndpointFailure(
      () => baseResumeRetirementEndpoint(createEvent()),
      {
        code: 'authentication-required',
        statusCode: 401,
        statusMessage: 'Authentication is required.',
      },
    )

    expect(mocks.retireBaseResume).not.toHaveBeenCalled()
  })

  it('distinguishes temporary authentication unavailability', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'service-unavailable',
        message: providerMessage,
      },
    })

    await expectEndpointFailure(
      () => baseResumeRetirementEndpoint(createEvent()),
      {
        code: 'authentication-unavailable',
        statusCode: 503,
        statusMessage: 'Retirement authentication is temporarily unavailable.',
      },
    )

    expect(mocks.retireBaseResume).not.toHaveBeenCalled()
  })

  it('does not distinguish a missing resume from a cross-owner resume', async () => {
    mocks.retireBaseResume.mockRejectedValue(
      new BaseResumeRetirementServiceError('base-resume-unavailable'),
    )

    await expectEndpointFailure(
      () => baseResumeRetirementEndpoint(createEvent()),
      {
        code: 'base-resume-unavailable',
        statusCode: 404,
        statusMessage: 'The base resume is unavailable.',
      },
    )
  })

  it('maps a persistence failure to a recoverable response', async () => {
    mocks.retireBaseResume.mockRejectedValue(
      new BaseResumeRetirementServiceError(
        'persistence-unavailable',
        new Error(providerMessage),
      ),
    )

    await expectEndpointFailure(
      () => baseResumeRetirementEndpoint(createEvent()),
      {
        code: 'base-resume-retirement-unavailable',
        statusCode: 503,
        statusMessage: 'Base resume retirement is temporarily unavailable.',
      },
    )
  })

  it.each(['inconsistent-state', 'unexpected-failure'] as const)(
    'maps the %s service failure to a sanitized internal response',
    async (kind) => {
      mocks.retireBaseResume.mockRejectedValue(
        new BaseResumeRetirementServiceError(kind, new Error(providerMessage)),
      )

      await expectEndpointFailure(
        () => baseResumeRetirementEndpoint(createEvent()),
        {
          code: 'base-resume-retirement-unavailable',
          statusCode: 500,
          statusMessage: 'Base resume retirement could not be completed.',
        },
      )
    },
  )

  it('sanitizes an unexpected service failure', async () => {
    mocks.retireBaseResume.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(
      () => baseResumeRetirementEndpoint(createEvent()),
      {
        code: 'base-resume-retirement-unavailable',
        statusCode: 500,
        statusMessage: 'Base resume retirement could not be completed.',
      },
    )
  })

  it('sanitizes an invalid service result', async () => {
    mocks.retireBaseResume.mockResolvedValue({
      id: providerMessage,
      retiredAt,
    })

    await expectEndpointFailure(
      () => baseResumeRetirementEndpoint(createEvent()),
      {
        code: 'base-resume-retirement-unavailable',
        statusCode: 500,
        statusMessage: 'Base resume retirement could not be completed.',
      },
    )
  })
})
