import { Readable } from 'node:stream'

import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAXIMUM_BASE_RESUME_SIZE_BYTES } from '../../shared/base-resumes/constraints'
import { BaseResumeUploadDomainError } from '../../server/domain/base-resumes/upload'
import baseResumeUploadEndpoint, {
  BASE_RESUME_MULTIPART_OVERHEAD_BYTES,
  MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES,
} from '../../server/api/base-resumes/index.post'
import { BaseResumeUploadServiceError } from '../../server/services/upload-base-resume'
import type { ServerSupabaseClient } from '../../server/utils/authentication/supabase'

const mocks = vi.hoisted(() => {
  const createError = (input: {
    data: unknown
    statusCode: number
    statusMessage: string
  }) => Object.assign(new Error(input.statusMessage), input)
  const readMultipartFormData = vi.fn()

  Object.assign(globalThis, {
    createError,
    defineEventHandler: <T>(handler: T): T => handler,
    readMultipartFormData,
  })

  return {
    createAuthenticationServerClient: vi.fn(),
    markAuthenticationResponsePrivate: vi.fn(),
    readMultipartFormData,
    resolveAuthenticatedUser: vi.fn(),
    uploadBaseResume: vi.fn(),
  }
})

vi.mock('../../server/utils/authentication/supabase', () => ({
  createAuthenticationServerClient: mocks.createAuthenticationServerClient,
  markAuthenticationResponsePrivate: mocks.markAuthenticationResponsePrivate,
}))

vi.mock('../../server/utils/authentication/user', () => ({
  resolveAuthenticatedUser: mocks.resolveAuthenticatedUser,
}))

vi.mock('../../server/services/upload-base-resume', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../server/services/upload-base-resume')
    >()

  return {
    ...original,
    uploadBaseResume: mocks.uploadBaseResume,
  }
})

const userId = '4f384f77-8482-4262-9bcb-f37439e0cc8a'
const baseResumeId = 'be87b7cb-e959-4be1-b29a-8c4dd1203b56'
const client = {} as ServerSupabaseClient
const providerMessage = 'Sensitive provider implementation details'
const pdfBytes = Buffer.from('%PDF-1.7\nResumAI\n%%EOF')
const requestBody = Buffer.from('bounded multipart request body')
const multipartContentType =
  'multipart/form-data; boundary=resumeai-test-boundary'
const uploadedBaseResume = {
  activeSlot: 1 as const,
  createdAt: '2026-08-05T08:30:00+00:00',
  id: baseResumeId,
  originalFilename: 'Frontend Engineer.pdf',
}

interface CreateEventOptions {
  body?: Buffer | readonly Buffer[]
  contentLength?: number | null
  contentType?: string | null
}

const createEvent = (options: CreateEventOptions = {}): H3Event => {
  const body = options.body ?? requestBody
  const contentType =
    options.contentType === undefined
      ? multipartContentType
      : options.contentType
  const bodyLength = Buffer.isBuffer(body)
    ? body.byteLength
    : body.reduce((total, chunk) => total + chunk.byteLength, 0)
  const contentLength =
    options.contentLength === undefined ? bodyLength : options.contentLength
  const request = Readable.from(body) as Readable & {
    headers: Record<string, string>
    method: string
    url: string
  }
  const headers: Record<string, string> = {}

  if (contentType !== null) {
    headers['content-type'] = contentType
  }

  if (contentLength !== null) {
    headers['content-length'] = String(contentLength)
  }

  Object.assign(request, {
    headers,
    method: 'POST',
    url: '/api/base-resumes',
  })

  return {
    context: {},
    node: {
      req: request,
      res: {},
    },
    path: '/api/base-resumes',
  } as H3Event
}

const createFilePart = (
  overrides: {
    data?: Buffer
    filename?: string
    name?: string
    type?: string
  } = {},
) => ({
  data: overrides.data ?? pdfBytes,
  filename: overrides.filename ?? 'Frontend Engineer.pdf',
  name: overrides.name ?? 'file',
  type: overrides.type ?? 'application/pdf',
})

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

  throw new Error('Expected the base-resume upload endpoint to fail.')
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
  mocks.readMultipartFormData.mockResolvedValue([createFilePart()])
  mocks.uploadBaseResume.mockResolvedValue(uploadedBaseResume)
})

describe('base-resume upload endpoint', () => {
  it('uses one trusted client and returns the safe upload representation', async () => {
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
    mocks.readMultipartFormData.mockImplementation(
      async (receivedEvent: H3Event) => {
        expect(
          (
            receivedEvent.node.req as H3Event['node']['req'] & {
              rawBody?: Buffer
            }
          ).rawBody,
        ).toEqual(requestBody)

        return [createFilePart()]
      },
    )

    await expect(baseResumeUploadEndpoint(event)).resolves.toEqual({
      baseResume: uploadedBaseResume,
    })

    expect(mocks.markAuthenticationResponsePrivate).toHaveBeenCalledWith(event)
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAuthenticationServerClient).toHaveBeenCalledWith(event)
    expect(mocks.resolveAuthenticatedUser).toHaveBeenCalledOnce()
    expect(mocks.readMultipartFormData).toHaveBeenCalledOnce()
    expect(mocks.uploadBaseResume).toHaveBeenCalledOnce()
    expect(mocks.uploadBaseResume).toHaveBeenCalledWith(
      { client, userId },
      {
        bytes: expect.any(Uint8Array),
        contentType: 'application/pdf',
        originalFilename: 'Frontend Engineer.pdf',
      },
    )
    expect(
      Buffer.from(mocks.uploadBaseResume.mock.calls[0]?.[1].bytes),
    ).toEqual(pdfBytes)
    expect(event.node.res.statusCode).toBe(201)
  })

  it('keeps the multipart allowance narrowly above the approved file limit', () => {
    expect(MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES).toBe(
      MAXIMUM_BASE_RESUME_SIZE_BYTES + BASE_RESUME_MULTIPART_OVERHEAD_BYTES,
    )
    expect(BASE_RESUME_MULTIPART_OVERHEAD_BYTES).toBe(64 * 1024)
  })

  it('rejects unauthenticated requests before reading the body', async () => {
    const event = createEvent()

    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'unauthenticated',
        message: 'Authentication is required.',
      },
    })

    await expectEndpointFailure(() => baseResumeUploadEndpoint(event), {
      code: 'authentication-required',
      statusCode: 401,
      statusMessage: 'Authentication is required.',
    })

    expect(mocks.readMultipartFormData).not.toHaveBeenCalled()
    expect(mocks.uploadBaseResume).not.toHaveBeenCalled()
  })

  it('distinguishes temporary authentication unavailability', async () => {
    mocks.resolveAuthenticatedUser.mockResolvedValue({
      authenticated: false,
      error: {
        code: 'service-unavailable',
        message: providerMessage,
      },
    })

    await expectEndpointFailure(() => baseResumeUploadEndpoint(createEvent()), {
      code: 'authentication-unavailable',
      statusCode: 503,
      statusMessage: 'Upload authentication is temporarily unavailable.',
    })

    expect(mocks.readMultipartFormData).not.toHaveBeenCalled()
    expect(mocks.uploadBaseResume).not.toHaveBeenCalled()
  })

  it.each([
    ['missing content type', null],
    ['wrong content type', 'application/pdf'],
    ['missing boundary', 'multipart/form-data'],
  ])('rejects an invalid multipart envelope: %s', async (_, contentType) => {
    await expectEndpointFailure(
      () => baseResumeUploadEndpoint(createEvent({ contentType })),
      {
        code: 'invalid-upload',
        statusCode: 400,
        statusMessage: 'Upload exactly one PDF using the file field.',
      },
    )

    expect(mocks.readMultipartFormData).not.toHaveBeenCalled()
    expect(mocks.uploadBaseResume).not.toHaveBeenCalled()
  })

  it('rejects a declared request larger than the transport limit', async () => {
    await expectEndpointFailure(
      () =>
        baseResumeUploadEndpoint(
          createEvent({
            contentLength: MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES + 1,
          }),
        ),
      {
        code: 'file-too-large',
        statusCode: 413,
        statusMessage: 'The PDF exceeds the 10 MiB upload limit.',
      },
    )

    expect(mocks.readMultipartFormData).not.toHaveBeenCalled()
    expect(mocks.uploadBaseResume).not.toHaveBeenCalled()
  })

  it('enforces the transport limit when content length is unavailable', async () => {
    await expectEndpointFailure(
      () =>
        baseResumeUploadEndpoint(
          createEvent({
            body: [
              Buffer.alloc(MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES),
              Buffer.alloc(1),
            ],
            contentLength: null,
          }),
        ),
      {
        code: 'file-too-large',
        statusCode: 413,
        statusMessage: 'The PDF exceeds the 10 MiB upload limit.',
      },
    )

    expect(mocks.readMultipartFormData).not.toHaveBeenCalled()
    expect(mocks.uploadBaseResume).not.toHaveBeenCalled()
  })

  it.each([
    ['no parts', []],
    ['multiple parts', [createFilePart(), createFilePart()]],
    ['wrong field', [createFilePart({ name: 'resume' })]],
    [
      'non-file field',
      [{ data: pdfBytes, name: 'file', type: 'application/pdf' }],
    ],
  ])('rejects an unsupported multipart shape: %s', async (_, parts) => {
    mocks.readMultipartFormData.mockResolvedValue(parts)

    await expectEndpointFailure(() => baseResumeUploadEndpoint(createEvent()), {
      code: 'invalid-upload',
      statusCode: 400,
      statusMessage: 'Upload exactly one PDF using the file field.',
    })

    expect(mocks.uploadBaseResume).not.toHaveBeenCalled()
  })

  it('sanitizes multipart parser failures', async () => {
    mocks.readMultipartFormData.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(() => baseResumeUploadEndpoint(createEvent()), {
      code: 'invalid-upload',
      statusCode: 400,
      statusMessage: 'Upload exactly one PDF using the file field.',
    })
  })

  it.each([
    [
      'file-too-large',
      'file-too-large',
      413,
      'The PDF exceeds the 10 MiB upload limit.',
    ],
    [
      'unsupported-file-type',
      'unsupported-file-type',
      415,
      'Only PDF uploads are supported.',
    ],
    [
      'invalid-filename',
      'invalid-filename',
      422,
      'The PDF filename is not supported.',
    ],
    ['empty-file', 'invalid-pdf', 422, 'The uploaded file is not a valid PDF.'],
    [
      'invalid-pdf',
      'invalid-pdf',
      422,
      'The uploaded file is not a valid PDF.',
    ],
  ] as const)(
    'maps the %s domain failure safely',
    async (domainCode, endpointCode, statusCode, statusMessage) => {
      mocks.uploadBaseResume.mockRejectedValue(
        new BaseResumeUploadDomainError(domainCode),
      )

      await expectEndpointFailure(
        () => baseResumeUploadEndpoint(createEvent()),
        { code: endpointCode, statusCode, statusMessage },
      )
    },
  )

  it.each([
    [
      'active-resume-limit-reached',
      'active-resume-limit-reached',
      409,
      'The active base resume limit has been reached.',
    ],
    [
      'storage-unavailable',
      'base-resume-upload-unavailable',
      503,
      'Base resume upload is temporarily unavailable.',
    ],
    [
      'persistence-unavailable',
      'base-resume-upload-unavailable',
      503,
      'Base resume upload is temporarily unavailable.',
    ],
    [
      'compensation-failed',
      'base-resume-upload-unavailable',
      500,
      'Base resume upload could not be completed.',
    ],
    [
      'inconsistent-state',
      'base-resume-upload-unavailable',
      500,
      'Base resume upload could not be completed.',
    ],
  ] as const)(
    'maps the %s service failure safely',
    async (serviceKind, endpointCode, statusCode, statusMessage) => {
      mocks.uploadBaseResume.mockRejectedValue(
        new BaseResumeUploadServiceError(
          serviceKind,
          new Error(providerMessage),
        ),
      )

      await expectEndpointFailure(
        () => baseResumeUploadEndpoint(createEvent()),
        { code: endpointCode, statusCode, statusMessage },
      )
    },
  )

  it('sanitizes an unexpected service failure', async () => {
    mocks.uploadBaseResume.mockRejectedValue(new Error(providerMessage))

    await expectEndpointFailure(() => baseResumeUploadEndpoint(createEvent()), {
      code: 'base-resume-upload-unavailable',
      statusCode: 500,
      statusMessage: 'Base resume upload could not be completed.',
    })
  })

  it('sanitizes an invalid service result', async () => {
    const event = createEvent()

    mocks.uploadBaseResume.mockResolvedValue({
      ...uploadedBaseResume,
      id: providerMessage,
    })

    await expectEndpointFailure(() => baseResumeUploadEndpoint(event), {
      code: 'base-resume-upload-unavailable',
      statusCode: 500,
      statusMessage: 'Base resume upload could not be completed.',
    })

    expect(event.node.res.statusCode).toBeUndefined()
  })
})
