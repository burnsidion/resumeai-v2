import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import applicationListEndpoint from '../../server/api/applications/index.get'
import applicationCreateEndpoint from '../../server/api/applications/index.post'
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
    readBody,
  })

  return {
    createApplication: vi.fn(),
    createAuthenticationServerClient: vi.fn(),
    listApplications: vi.fn(),
    markAuthenticationResponsePrivate: vi.fn(),
    readBody,
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
      createApplication: mocks.createApplication,
      listApplications: mocks.listApplications,
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

const createEvent = (method: 'GET' | 'POST'): H3Event =>
  ({
    context: {},
    method,
    node: {
      req: { method, url: '/api/applications' },
      res: {},
    },
    path: '/api/applications',
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
  mocks.listApplications.mockResolvedValue([application])
  mocks.createApplication.mockResolvedValue(application)
  mocks.readBody.mockResolvedValue({
    company: application.company,
    jobDescription: application.jobDescription,
    postingUrl: application.postingUrl,
    role: application.role,
    selectedBaseResumeId: baseResumeId,
  })
})

describe('application collection endpoints', () => {
  it('lists applications with one trusted request-scoped client', async () => {
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

    await expect(applicationListEndpoint(event)).resolves.toMatchObject({
      applications: [
        {
          company: application.company,
          id: applicationId,
          readiness: { isReady: true },
          role: application.role,
          statusLabel: 'Draft',
        },
      ],
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.listApplications).toHaveBeenCalledOnce()
    expect(mocks.listApplications).toHaveBeenCalledWith({ client, userId })
    expect(mocks.readBody).not.toHaveBeenCalled()
  })

  it('treats an empty application collection as a successful response', async () => {
    mocks.listApplications.mockResolvedValue([])

    await expect(applicationListEndpoint(createEvent('GET'))).resolves.toEqual({
      applications: [],
    })
  })

  it('normalizes a create request and returns a safe detail response', async () => {
    const event = createEvent('POST')

    mocks.readBody.mockResolvedValue({
      company: `  ${application.company}  `,
      jobDescription: `  ${application.jobDescription}  `,
      notes: '   ',
      postingUrl: `  ${application.postingUrl}  `,
      role: `  ${application.role}  `,
      selectedBaseResumeId: baseResumeId,
    })

    await expect(applicationCreateEndpoint(event)).resolves.toMatchObject({
      application: {
        company: application.company,
        id: applicationId,
        jobDescription: application.jobDescription,
        notes: null,
        postingUrl: application.postingUrl,
        role: application.role,
        selectedBaseResume: { id: baseResumeId },
      },
    })

    expect(mocks.createApplication).toHaveBeenCalledWith(
      { client, userId },
      {
        company: application.company,
        jobDescription: application.jobDescription,
        notes: null,
        postingUrl: application.postingUrl,
        role: application.role,
        selectedBaseResumeId: baseResumeId,
      },
    )
    expect(event.node.res.statusCode).toBe(201)
  })

  it.each([
    {
      endpoint: 'list',
      invoke: () => applicationListEndpoint(createEvent('GET')),
    },
    {
      endpoint: 'create',
      invoke: () => applicationCreateEndpoint(createEvent('POST')),
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

      expect(mocks.listApplications).not.toHaveBeenCalled()
      expect(mocks.createApplication).not.toHaveBeenCalled()
      expect(mocks.readBody).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      endpoint: 'list',
      invoke: () => applicationListEndpoint(createEvent('GET')),
    },
    {
      endpoint: 'create',
      invoke: () => applicationCreateEndpoint(createEvent('POST')),
    },
  ])('reports unavailable authentication for $endpoint', async ({ invoke }) => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'service-unavailable',
        message: providerMessage,
      },
    })

    await expectEndpointFailure(invoke, {
      code: 'authentication-unavailable',
      statusCode: 503,
      statusMessage: 'Application authentication is temporarily unavailable.',
    })
  })

  it.each([
    ['missing role', { company: application.company }],
    [
      'server-owned fields',
      {
        company: application.company,
        role: application.role,
        userId,
      },
    ],
    [
      'invalid URL',
      {
        company: application.company,
        postingUrl: 'javascript:alert(1)',
        role: application.role,
      },
    ],
  ])('rejects a create request with %s', async (_name, body) => {
    mocks.readBody.mockResolvedValue(body)

    await expectEndpointFailure(
      () => applicationCreateEndpoint(createEvent('POST')),
      {
        code: 'invalid-application',
        statusCode: 400,
        statusMessage: 'A valid application is required.',
      },
    )

    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('sanitizes an unreadable create body', async () => {
    mocks.readBody.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(
      () => applicationCreateEndpoint(createEvent('POST')),
      {
        code: 'invalid-application',
        statusCode: 400,
        statusMessage: 'A valid application is required.',
      },
    )

    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('maps list persistence failures to one recoverable response', async () => {
    mocks.listApplications.mockRejectedValue(
      new ApplicationManagementServiceError(
        'persistence-unavailable',
        new Error(providerMessage),
      ),
    )

    await expectEndpointFailure(
      () => applicationListEndpoint(createEvent('GET')),
      {
        code: 'applications-unavailable',
        statusCode: 503,
        statusMessage: 'Applications are temporarily unavailable.',
      },
    )
  })

  it('maps an inaccessible resume selection without exposing why', async () => {
    mocks.createApplication.mockRejectedValue(
      new ApplicationManagementServiceError('selected-base-resume-unavailable'),
    )

    await expectEndpointFailure(
      () => applicationCreateEndpoint(createEvent('POST')),
      {
        code: 'selected-base-resume-unavailable',
        statusCode: 409,
        statusMessage: 'The selected base resume is unavailable.',
      },
    )
  })

  it.each([
    [
      'persistence-unavailable',
      503,
      'Application saving is temporarily unavailable.',
    ],
    ['inconsistent-state', 500, 'The application could not be saved.'],
  ] as const)(
    'maps the %s create failure to a sanitized response',
    async (kind, statusCode, statusMessage) => {
      mocks.createApplication.mockRejectedValue(
        new ApplicationManagementServiceError(kind, new Error(providerMessage)),
      )

      await expectEndpointFailure(
        () => applicationCreateEndpoint(createEvent('POST')),
        {
          code: 'application-save-unavailable',
          statusCode,
          statusMessage,
        },
      )
    },
  )

  it('sanitizes an unexpected list response mapping failure', async () => {
    mocks.listApplications.mockResolvedValue([
      { ...application, company: '', sensitive: providerMessage },
    ])

    await expectEndpointFailure(
      () => applicationListEndpoint(createEvent('GET')),
      {
        code: 'applications-unavailable',
        statusCode: 500,
        statusMessage: 'Applications could not be loaded.',
      },
    )
  })

  it('sanitizes an unexpected create response mapping failure', async () => {
    const event = createEvent('POST')

    mocks.createApplication.mockResolvedValue({
      ...application,
      company: '',
      sensitive: providerMessage,
    })

    await expectEndpointFailure(() => applicationCreateEndpoint(event), {
      code: 'application-save-unavailable',
      statusCode: 500,
      statusMessage: 'The application could not be saved.',
    })

    expect(event.node.res.statusCode).not.toBe(201)
  })
})
