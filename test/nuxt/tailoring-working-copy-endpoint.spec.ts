import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import tailoringEndpoint from '../../server/api/applications/[id]/tailoring.post'
import { GenerateApplicationWorkingCopyError } from '../../server/services/generate-application-working-copy'
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
    generateApplicationWorkingCopy: vi.fn(),
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
  '../../server/services/generate-application-working-copy',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../server/services/generate-application-working-copy')
      >()

    return {
      ...original,
      generateApplicationWorkingCopy: mocks.generateApplicationWorkingCopy,
    }
  },
)

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'

const createEvent = (id: string | null = applicationId): H3Event =>
  ({
    context: { params: id === null ? {} : { id } },
    method: 'POST',
    node: {
      req: { method: 'POST', url: `/api/applications/${id ?? ''}/tailoring` },
      res: {},
    },
    path: `/api/applications/${id ?? ''}/tailoring`,
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

  throw new Error('Expected the tailoring endpoint to fail.')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createAuthenticationServerClient.mockReturnValue(client)
  mocks.resolveAuthenticatedUser.mockResolvedValue({
    authenticated: true,
    user: { email: 'person@example.com', id: userId },
  })
  mocks.generateApplicationWorkingCopy.mockResolvedValue({
    id: workingCopyId,
    revisionNumber: 1,
    updatedAt: '2026-10-14T00:00:00.000Z',
  })
})

describe('application tailoring endpoint', () => {
  it('starts one working-copy generation through one trusted request-scoped client', async () => {
    const event = createEvent()

    await expect(tailoringEndpoint(event)).resolves.toEqual({
      workingCopy: {
        id: workingCopyId,
        revisionNumber: 1,
        updatedAt: '2026-10-14T00:00:00.000Z',
      },
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.generateApplicationWorkingCopy).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
    )
  })

  it.each([null, '', 'not-a-uuid'])(
    'rejects an invalid route ID before product work: %s',
    async (id) => {
      await expectEndpointFailure(() => tailoringEndpoint(createEvent(id)), {
        code: 'invalid-application-id',
        statusCode: 400,
        statusMessage: 'A valid application ID is required.',
      })

      expect(mocks.generateApplicationWorkingCopy).not.toHaveBeenCalled()
    },
  )

  it('rejects unauthenticated requests before validating or generating', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expectEndpointFailure(() => tailoringEndpoint(createEvent()), {
      code: 'authentication-required',
      statusCode: 401,
      statusMessage: 'Authentication is required.',
    })

    expect(mocks.generateApplicationWorkingCopy).not.toHaveBeenCalled()
  })

  it.each([
    [
      'application-unavailable',
      'application-unavailable',
      404,
      'The application is unavailable.',
    ],
    [
      'application-not-ready',
      'application-not-ready',
      409,
      'Add a job description and active base resume before tailoring.',
    ],
    [
      'operation-in-progress',
      'tailoring-in-progress',
      409,
      'Tailoring is already in progress for this application.',
    ],
    [
      'working-copy-immutable',
      'working-copy-immutable',
      409,
      'The current working copy can no longer be replaced.',
    ],
    [
      'provider-unavailable',
      'tailoring-unavailable',
      503,
      'AI tailoring is temporarily unavailable.',
    ],
  ] as const)(
    'maps %s to a stable sanitized endpoint response',
    async (serviceKind, code, statusCode, statusMessage) => {
      mocks.generateApplicationWorkingCopy.mockRejectedValue(
        new GenerateApplicationWorkingCopyError(
          serviceKind,
          new Error(providerMessage),
        ),
      )

      await expectEndpointFailure(() => tailoringEndpoint(createEvent()), {
        code,
        statusCode,
        statusMessage,
      })
    },
  )

  it('sanitizes unexpected failures', async () => {
    mocks.generateApplicationWorkingCopy.mockRejectedValue(
      new Error(providerMessage),
    )

    await expectEndpointFailure(() => tailoringEndpoint(createEvent()), {
      code: 'tailoring-unavailable',
      statusCode: 500,
      statusMessage: 'AI tailoring could not be completed.',
    })
  })
})
