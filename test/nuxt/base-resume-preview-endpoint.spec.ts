import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import baseResumePreviewEndpoint from '../../server/api/base-resumes/[id]/preview.get'
import { BaseResumePreviewServiceError } from '../../server/services/prepare-base-resume-preview'
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
    prepareBaseResumePreview: vi.fn(),
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
  '../../server/services/prepare-base-resume-preview',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../server/services/prepare-base-resume-preview')
      >()

    return {
      ...original,
      prepareBaseResumePreview: mocks.prepareBaseResumePreview,
    }
  },
)

const userId = '4f384f77-8482-4262-9bcb-f37439e0cc8a'
const baseResumeId = 'be87b7cb-e959-4be1-b29a-8c4dd1203b56'
const preview = {
  baseResumeId,
  expiresAt: '2026-08-22T05:05:00.000Z',
  originalFilename: 'Frontend Engineer.pdf',
  url: 'https://example.supabase.co/storage/v1/object/sign/base-resumes/file.pdf?token=test',
}
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'

const createEvent = (id: string | null = baseResumeId): H3Event =>
  ({
    context: { params: id === null ? {} : { id } },
    path: id ? `/api/base-resumes/${id}/preview` : '/api/base-resumes//preview',
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

  throw new Error('Expected the base-resume preview endpoint to fail.')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createAuthenticationServerClient.mockReturnValue(client)
  mocks.resolveAuthenticatedUser.mockResolvedValue({
    authenticated: true,
    user: { email: 'person@example.com', id: userId },
  })
  mocks.prepareBaseResumePreview.mockResolvedValue(preview)
})

describe('base-resume preview endpoint', () => {
  it('uses one trusted client and returns only temporary preview access', async () => {
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
          user: { email: 'person@example.com', id: userId },
        }
      },
    )

    await expect(baseResumePreviewEndpoint(event)).resolves.toEqual({ preview })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.prepareBaseResumePreview).toHaveBeenCalledWith(
      { client, userId },
      baseResumeId,
    )
  })

  it.each([null, '', 'not-a-uuid'])(
    'rejects an invalid route ID without preparing access: %s',
    async (id) => {
      await expectEndpointFailure(
        () => baseResumePreviewEndpoint(createEvent(id)),
        {
          code: 'invalid-base-resume-id',
          statusCode: 400,
          statusMessage: 'A valid base resume ID is required.',
        },
      )

      expect(mocks.prepareBaseResumePreview).not.toHaveBeenCalled()
    },
  )

  it('rejects unauthenticated requests before validating or preparing access', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expectEndpointFailure(
      () => baseResumePreviewEndpoint(createEvent()),
      {
        code: 'authentication-required',
        statusCode: 401,
        statusMessage: 'Authentication is required.',
      },
    )

    expect(mocks.prepareBaseResumePreview).not.toHaveBeenCalled()
  })

  it('distinguishes temporary authentication unavailability', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: { code: 'service-unavailable', message: providerMessage },
    })

    await expectEndpointFailure(
      () => baseResumePreviewEndpoint(createEvent()),
      {
        code: 'authentication-unavailable',
        statusCode: 503,
        statusMessage: 'Preview authentication is temporarily unavailable.',
      },
    )
  })

  it('does not distinguish missing, cross-owner, or retired resumes', async () => {
    mocks.prepareBaseResumePreview.mockRejectedValue(
      new BaseResumePreviewServiceError('base-resume-unavailable'),
    )

    await expectEndpointFailure(
      () => baseResumePreviewEndpoint(createEvent()),
      {
        code: 'base-resume-unavailable',
        statusCode: 404,
        statusMessage: 'The base resume is unavailable.',
      },
    )
  })

  it.each(['persistence-unavailable', 'storage-unavailable'] as const)(
    'maps %s to a recoverable preview failure',
    async (kind) => {
      mocks.prepareBaseResumePreview.mockRejectedValue(
        new BaseResumePreviewServiceError(kind, new Error(providerMessage)),
      )

      await expectEndpointFailure(
        () => baseResumePreviewEndpoint(createEvent()),
        {
          code: 'base-resume-preview-unavailable',
          statusCode: 503,
          statusMessage: 'Base resume preview is temporarily unavailable.',
        },
      )
    },
  )

  it.each(['inconsistent-state', 'unexpected-failure'] as const)(
    'maps %s to a sanitized internal failure',
    async (kind) => {
      mocks.prepareBaseResumePreview.mockRejectedValue(
        new BaseResumePreviewServiceError(kind, new Error(providerMessage)),
      )

      await expectEndpointFailure(
        () => baseResumePreviewEndpoint(createEvent()),
        {
          code: 'base-resume-preview-unavailable',
          statusCode: 500,
          statusMessage: 'Base resume preview could not be prepared.',
        },
      )
    },
  )

  it('sanitizes unexpected service failures', async () => {
    mocks.prepareBaseResumePreview.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(
      () => baseResumePreviewEndpoint(createEvent()),
      {
        code: 'base-resume-preview-unavailable',
        statusCode: 500,
        statusMessage: 'Base resume preview could not be prepared.',
      },
    )
  })

  it('sanitizes invalid service output', async () => {
    mocks.prepareBaseResumePreview.mockResolvedValue({
      ...preview,
      url: providerMessage,
    })

    await expectEndpointFailure(
      () => baseResumePreviewEndpoint(createEvent()),
      {
        code: 'base-resume-preview-unavailable',
        statusCode: 500,
        statusMessage: 'Base resume preview could not be prepared.',
      },
    )
  })
})
