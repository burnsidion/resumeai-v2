import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import applicationDetailEndpoint from '../../server/api/applications/[id].get'
import applicationUpdateEndpoint from '../../server/api/applications/[id].patch'
import type { ApplicationManagementData } from '../../shared/applications/management'
import { ApplicationManagementServiceError } from '../../server/services/application-management'
import type { ServerSupabaseClient } from '../../server/utils/authentication/supabase'

const mocks = vi.hoisted(() => {
  const createError = (input: {
    data: unknown
    statusCode: number
    statusMessage: string
  }) => Object.assign(new Error(input.statusMessage), input)
  const readBody = vi.fn()

  Object.assign(globalThis, {
    createError,
    defineEventHandler: <T>(handler: T): T => handler,
    getRouterParam: (event: H3Event, name: string) =>
      (
        event.context.params as Record<string, string | undefined> | undefined
      )?.[name],
    readBody,
  })

  return {
    createAuthenticationServerClient: vi.fn(),
    loadApplication: vi.fn(),
    markAuthenticationResponsePrivate: vi.fn(),
    readBody,
    resolveAuthenticatedUser: vi.fn(),
    updateApplication: vi.fn(),
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
      loadApplication: mocks.loadApplication,
      updateApplication: mocks.updateApplication,
    }
  },
)

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'

const application: ApplicationManagementData = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-08-19T18:00:00.000Z',
  id: applicationId,
  jobDescription: 'Build calm, accessible product experiences.',
  notes: null,
  postingUrl: 'https://example.com/jobs/123',
  readiness: { isReady: true, missingRequirements: [] },
  role: 'Senior Frontend Engineer',
  selectedBaseResume: {
    activeSlot: 1,
    id: baseResumeId,
    isAvailable: true,
    originalFilename: 'Frontend Engineering.pdf',
    retiredAt: null,
  },
  status: 'draft',
  updatedAt: '2026-08-20T18:00:00.000Z',
}

const createEvent = (
  method: 'GET' | 'PATCH',
  id: string | null = applicationId,
): H3Event =>
  ({
    context: {
      params: id === null ? {} : { id },
    },
    method,
    node: {
      req: { method, url: `/api/applications/${id ?? ''}` },
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

  throw new Error('Expected the application endpoint to fail.')
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
  mocks.loadApplication.mockResolvedValue(application)
  mocks.updateApplication.mockResolvedValue(application)
  mocks.readBody.mockResolvedValue({
    jobDescription: application.jobDescription,
    selectedBaseResumeId: baseResumeId,
  })
})

describe('application detail endpoints', () => {
  it('loads one application with one trusted request-scoped client', async () => {
    const event = createEvent('GET')

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

    await expect(applicationDetailEndpoint(event)).resolves.toMatchObject({
      application: {
        company: application.company,
        id: applicationId,
        readiness: { isReady: true },
        selectedBaseResume: { id: baseResumeId },
      },
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.loadApplication).toHaveBeenCalledOnce()
    expect(mocks.loadApplication).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
    )
    expect(mocks.readBody).not.toHaveBeenCalled()
  })

  it('normalizes an update and returns the safe application detail', async () => {
    const event = createEvent('PATCH')

    mocks.readBody.mockResolvedValue({
      company: `  ${application.company}  `,
      jobDescription: '   ',
      selectedBaseResumeId: null,
      status: 'applied',
    })

    await expect(applicationUpdateEndpoint(event)).resolves.toMatchObject({
      application: {
        company: application.company,
        id: applicationId,
      },
    })

    expect(mocks.updateApplication).toHaveBeenCalledWith(
      { client, userId },
      applicationId,
      {
        company: application.company,
        jobDescription: null,
        selectedBaseResumeId: null,
        status: 'applied',
      },
    )
  })

  it.each([
    {
      endpoint: 'load',
      invoke: () => applicationDetailEndpoint(createEvent('GET')),
    },
    {
      endpoint: 'update',
      invoke: () => applicationUpdateEndpoint(createEvent('PATCH')),
    },
  ])(
    'rejects unauthenticated $endpoint requests before product work',
    async ({ invoke }) => {
      mocks.resolveAuthenticatedUser.mockResolvedValue({
        authenticated: false,
        error: {
          code: 'unauthenticated',
          message: 'Authentication is required.',
        },
      })

      await expectEndpointFailure(invoke, {
        code: 'authentication-required',
        statusCode: 401,
        statusMessage: 'Authentication is required.',
      })

      expect(mocks.loadApplication).not.toHaveBeenCalled()
      expect(mocks.updateApplication).not.toHaveBeenCalled()
      expect(mocks.readBody).not.toHaveBeenCalled()
    },
  )

  it('reports temporary authentication unavailability', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'service-unavailable',
        message: providerMessage,
      },
    })

    await expectEndpointFailure(
      () => applicationDetailEndpoint(createEvent('GET')),
      {
        code: 'authentication-unavailable',
        statusCode: 503,
        statusMessage: 'Application authentication is temporarily unavailable.',
      },
    )

    expect(mocks.loadApplication).not.toHaveBeenCalled()
  })

  it.each([null, '', 'not-a-uuid'])(
    'rejects an invalid load ID without invoking the service: %s',
    async (id) => {
      await expectEndpointFailure(
        () => applicationDetailEndpoint(createEvent('GET', id)),
        {
          code: 'invalid-application-id',
          statusCode: 400,
          statusMessage: 'A valid application ID is required.',
        },
      )

      expect(mocks.loadApplication).not.toHaveBeenCalled()
    },
  )

  it.each([null, '', 'not-a-uuid'])(
    'rejects an invalid update ID before reading the body: %s',
    async (id) => {
      await expectEndpointFailure(
        () => applicationUpdateEndpoint(createEvent('PATCH', id)),
        {
          code: 'invalid-application-id',
          statusCode: 400,
          statusMessage: 'A valid application ID is required.',
        },
      )

      expect(mocks.readBody).not.toHaveBeenCalled()
      expect(mocks.updateApplication).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['empty update', {}],
    ['invalid date', { appliedOn: '08/20/2026' }],
    ['invalid status', { status: 'archived' }],
    ['server-owned field', { userId }],
  ])('rejects an update with %s', async (_name, body) => {
    mocks.readBody.mockResolvedValue(body)

    await expectEndpointFailure(
      () => applicationUpdateEndpoint(createEvent('PATCH')),
      {
        code: 'invalid-application',
        statusCode: 400,
        statusMessage: 'A valid application update is required.',
      },
    )

    expect(mocks.updateApplication).not.toHaveBeenCalled()
  })

  it('sanitizes an unreadable update body', async () => {
    mocks.readBody.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(
      () => applicationUpdateEndpoint(createEvent('PATCH')),
      {
        code: 'invalid-application',
        statusCode: 400,
        statusMessage: 'A valid application update is required.',
      },
    )

    expect(mocks.updateApplication).not.toHaveBeenCalled()
  })

  it.each([
    {
      endpoint: 'load',
      invoke: () => applicationDetailEndpoint(createEvent('GET')),
      service: mocks.loadApplication,
    },
    {
      endpoint: 'update',
      invoke: () => applicationUpdateEndpoint(createEvent('PATCH')),
      service: mocks.updateApplication,
    },
  ])(
    'does not distinguish a missing from cross-owner $endpoint target',
    async ({ invoke, service }) => {
      service.mockRejectedValue(
        new ApplicationManagementServiceError('application-unavailable'),
      )

      await expectEndpointFailure(invoke, {
        code: 'application-unavailable',
        statusCode: 404,
        statusMessage: 'The application is unavailable.',
      })
    },
  )

  it('maps an inaccessible new resume selection without exposing why', async () => {
    mocks.updateApplication.mockRejectedValue(
      new ApplicationManagementServiceError('selected-base-resume-unavailable'),
    )

    await expectEndpointFailure(
      () => applicationUpdateEndpoint(createEvent('PATCH')),
      {
        code: 'selected-base-resume-unavailable',
        statusCode: 409,
        statusMessage: 'The selected base resume is unavailable.',
      },
    )
  })

  it('maps load persistence failures to a recoverable response', async () => {
    mocks.loadApplication.mockRejectedValue(
      new ApplicationManagementServiceError(
        'persistence-unavailable',
        new Error(providerMessage),
      ),
    )

    await expectEndpointFailure(
      () => applicationDetailEndpoint(createEvent('GET')),
      {
        code: 'applications-unavailable',
        statusCode: 503,
        statusMessage: 'Applications are temporarily unavailable.',
      },
    )
  })

  it('maps update persistence failures to a recoverable response', async () => {
    mocks.updateApplication.mockRejectedValue(
      new ApplicationManagementServiceError(
        'persistence-unavailable',
        new Error(providerMessage),
      ),
    )

    await expectEndpointFailure(
      () => applicationUpdateEndpoint(createEvent('PATCH')),
      {
        code: 'application-save-unavailable',
        statusCode: 503,
        statusMessage: 'Application saving is temporarily unavailable.',
      },
    )
  })

  it.each([
    {
      code: 'applications-unavailable',
      endpoint: 'load',
      invoke: () => applicationDetailEndpoint(createEvent('GET')),
      service: mocks.loadApplication,
      statusMessage: 'The application could not be loaded.',
    },
    {
      code: 'application-save-unavailable',
      endpoint: 'update',
      invoke: () => applicationUpdateEndpoint(createEvent('PATCH')),
      service: mocks.updateApplication,
      statusMessage: 'The application could not be saved.',
    },
  ])(
    'sanitizes unexpected $endpoint failures',
    async ({ code, invoke, service, statusMessage }) => {
      service.mockRejectedValue(new Error(providerMessage))

      await expectEndpointFailure(invoke, {
        code,
        statusCode: 500,
        statusMessage,
      })
    },
  )
})
