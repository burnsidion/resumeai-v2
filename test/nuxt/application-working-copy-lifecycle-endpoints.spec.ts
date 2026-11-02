import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import acceptEndpoint from '../../server/api/applications/[id]/working-copy/accept.post'
import discardEndpoint from '../../server/api/applications/[id]/working-copy.delete'
import revisionEndpoint from '../../server/api/applications/[id]/working-copy/revision.post'
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
    readBody: async (event: H3Event) => event.context.body,
  })

  return {
    acceptApplicationWorkingCopy: vi.fn(),
    createAuthenticationServerClient: vi.fn(),
    discardApplicationWorkingCopy: vi.fn(),
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

vi.mock(
  '../../server/services/application-working-copy-lifecycle',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../server/services/application-working-copy-lifecycle')
      >()

    return {
      ...original,
      acceptApplicationWorkingCopy: mocks.acceptApplicationWorkingCopy,
      discardApplicationWorkingCopy: mocks.discardApplicationWorkingCopy,
    }
  },
)

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const client = {} as ServerSupabaseClient

const createEvent = (
  method: 'DELETE' | 'POST',
  body: unknown = undefined,
): H3Event =>
  ({
    context: { body, params: { id: applicationId } },
    method,
    node: {
      req: { method, url: `/api/applications/${applicationId}/working-copy` },
      res: {},
    },
    path: `/api/applications/${applicationId}/working-copy`,
  }) as unknown as H3Event

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createAuthenticationServerClient.mockReturnValue(client)
  mocks.resolveAuthenticatedUser.mockResolvedValue({
    authenticated: true,
    user: { email: 'person@example.com', id: userId },
  })
  mocks.generateApplicationWorkingCopy.mockResolvedValue({
    id: workingCopyId,
    revisionNumber: 2,
    updatedAt: '2026-11-01T00:00:00.000Z',
  })
  mocks.acceptApplicationWorkingCopy.mockResolvedValue({
    id: workingCopyId,
    revisionNumber: 2,
    state: 'accepted',
    updatedAt: '2026-11-01T00:00:00.000Z',
  })
  mocks.discardApplicationWorkingCopy.mockResolvedValue(workingCopyId)
})

describe('application working-copy lifecycle endpoints', () => {
  it('requests a revision through one trusted owner-scoped generation call', async () => {
    const event = createEvent('POST', {
      guidance: '  Emphasize accessible interface work.  ',
    })

    await expect(revisionEndpoint(event)).resolves.toEqual({
      workingCopy: {
        id: workingCopyId,
        revisionNumber: 2,
        state: 'awaiting_review',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    })
    expect(mocks.generateApplicationWorkingCopy).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
      undefined,
      {
        mode: 'revision',
        revisionGuidance: 'Emphasize accessible interface work.',
      },
    )
  })

  it('accepts and discards only through trusted request-scoped lifecycle calls', async () => {
    await expect(acceptEndpoint(createEvent('POST'))).resolves.toEqual({
      workingCopy: {
        id: workingCopyId,
        revisionNumber: 2,
        state: 'accepted',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    })
    await expect(discardEndpoint(createEvent('DELETE'))).resolves.toEqual({
      discardedWorkingCopyId: workingCopyId,
    })

    expect(mocks.acceptApplicationWorkingCopy).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
    )
    expect(mocks.discardApplicationWorkingCopy).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
    )
  })

  it('rejects unauthenticated lifecycle requests before product work', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expect(revisionEndpoint(createEvent('POST'))).rejects.toMatchObject({
      data: { code: 'authentication-required' },
      statusCode: 401,
    })
    expect(mocks.generateApplicationWorkingCopy).not.toHaveBeenCalled()
  })
})
