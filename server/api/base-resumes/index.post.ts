import type { H3Event } from 'h3'

import type {
  BaseResumeUploadEndpointErrorCode,
  UploadBaseResumeResponse,
} from '../../../shared/base-resumes/upload'
import { uploadBaseResumeResponseSchema } from '../../../shared/base-resumes/upload'
import {
  BaseResumeUploadDomainError,
  MAXIMUM_BASE_RESUME_SIZE_BYTES,
  type BaseResumeUploadCandidate,
} from '../../domain/base-resumes/upload'
import {
  BaseResumeUploadServiceError,
  uploadBaseResume,
} from '../../services/upload-base-resume'
import {
  createAuthenticationServerClient,
  markAuthenticationResponsePrivate,
} from '../../utils/authentication/supabase'
import { resolveAuthenticatedUser } from '../../utils/authentication/user'

export const BASE_RESUME_MULTIPART_OVERHEAD_BYTES = 64 * 1024
export const MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES =
  MAXIMUM_BASE_RESUME_SIZE_BYTES + BASE_RESUME_MULTIPART_OVERHEAD_BYTES

type BufferedRequest = H3Event['node']['req'] & { rawBody?: Buffer }

class BaseResumeRequestBodyError extends Error {
  constructor(readonly kind: 'invalid-body' | 'request-too-large') {
    super('The base resume request body could not be read.')
    this.name = 'BaseResumeRequestBodyError'
  }
}

const createBaseResumeUploadEndpointError = (
  code: BaseResumeUploadEndpointErrorCode,
  statusCode: number,
  statusMessage: string,
) =>
  createError({
    data: { code },
    statusCode,
    statusMessage,
  })

const hasSupportedMultipartContentType = (event: H3Event): boolean => {
  const contentType = event.node.req.headers['content-type']

  return (
    typeof contentType === 'string' &&
    contentType.toLowerCase().startsWith('multipart/form-data;') &&
    /(?:^|;)\s*boundary=(?:"[^"]+"|[^;\s]+)/iu.test(contentType)
  )
}

const getDeclaredContentLength = (event: H3Event): number | null => {
  const contentLength = event.node.req.headers['content-length']

  if (typeof contentLength !== 'string' || !/^\d+$/u.test(contentLength)) {
    return null
  }

  const parsed = Number(contentLength)

  return Number.isSafeInteger(parsed) ? parsed : null
}

const readBoundedRequestBody = async (event: H3Event): Promise<void> => {
  const declaredContentLength = getDeclaredContentLength(event)

  if (
    declaredContentLength !== null &&
    declaredContentLength > MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES
  ) {
    event.node.req.resume()
    throw new BaseResumeRequestBodyError('request-too-large')
  }

  const request = event.node.req as BufferedRequest
  const chunks: Buffer[] = []
  let receivedBytes = 0

  request.rawBody = await new Promise<Buffer>((resolve, reject) => {
    let settled = false

    const cleanup = (): void => {
      request.off('aborted', handleAborted)
      request.off('data', handleData)
      request.off('end', handleEnd)
      request.off('error', handleError)
    }

    const fail = (error: BaseResumeRequestBodyError): void => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      request.resume()
      reject(error)
    }

    function handleAborted(): void {
      fail(new BaseResumeRequestBodyError('invalid-body'))
    }

    function handleData(chunk: Buffer | string): void {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      receivedBytes += buffer.byteLength

      if (receivedBytes > MAXIMUM_BASE_RESUME_REQUEST_SIZE_BYTES) {
        fail(new BaseResumeRequestBodyError('request-too-large'))
        return
      }

      chunks.push(buffer)
    }

    function handleEnd(): void {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(Buffer.concat(chunks, receivedBytes))
    }

    function handleError(): void {
      fail(new BaseResumeRequestBodyError('invalid-body'))
    }

    request.on('aborted', handleAborted)
    request.on('data', handleData)
    request.on('end', handleEnd)
    request.on('error', handleError)
  })
}

const readUploadCandidate = async (
  event: H3Event,
): Promise<BaseResumeUploadCandidate> => {
  if (!hasSupportedMultipartContentType(event)) {
    throw new BaseResumeRequestBodyError('invalid-body')
  }

  await readBoundedRequestBody(event)

  let parts: Awaited<ReturnType<typeof readMultipartFormData>>

  try {
    parts = await readMultipartFormData(event)
  } catch {
    throw new BaseResumeRequestBodyError('invalid-body')
  }

  if (!parts || parts.length !== 1) {
    throw new BaseResumeRequestBodyError('invalid-body')
  }

  const file = parts[0]

  if (!file || file.name !== 'file' || typeof file.filename !== 'string') {
    throw new BaseResumeRequestBodyError('invalid-body')
  }

  return {
    bytes: new Uint8Array(
      file.data.buffer,
      file.data.byteOffset,
      file.data.byteLength,
    ),
    contentType: file.type ?? '',
    originalFilename: file.filename,
  }
}

const toDomainEndpointError = (error: BaseResumeUploadDomainError) => {
  switch (error.code) {
    case 'file-too-large':
      return createBaseResumeUploadEndpointError(
        'file-too-large',
        413,
        'The PDF exceeds the 10 MiB upload limit.',
      )
    case 'unsupported-file-type':
      return createBaseResumeUploadEndpointError(
        'unsupported-file-type',
        415,
        'Only PDF uploads are supported.',
      )
    case 'invalid-filename':
      return createBaseResumeUploadEndpointError(
        'invalid-filename',
        422,
        'The PDF filename is not supported.',
      )
    case 'empty-file':
    case 'invalid-pdf':
      return createBaseResumeUploadEndpointError(
        'invalid-pdf',
        422,
        'The uploaded file is not a valid PDF.',
      )
  }
}

const toServiceEndpointError = (error: BaseResumeUploadServiceError) => {
  if (error.kind === 'active-resume-limit-reached') {
    return createBaseResumeUploadEndpointError(
      'active-resume-limit-reached',
      409,
      'The active base resume limit has been reached.',
    )
  }

  const temporarilyUnavailable =
    error.kind === 'persistence-unavailable' ||
    error.kind === 'storage-unavailable'

  return createBaseResumeUploadEndpointError(
    'base-resume-upload-unavailable',
    temporarilyUnavailable ? 503 : 500,
    temporarilyUnavailable
      ? 'Base resume upload is temporarily unavailable.'
      : 'Base resume upload could not be completed.',
  )
}

export default defineEventHandler(
  async (event): Promise<UploadBaseResumeResponse> => {
    markAuthenticationResponsePrivate(event)

    const client = createAuthenticationServerClient(event)
    const authentication = await resolveAuthenticatedUser(event, {
      createClient: () => client,
    })

    if (!authentication.authenticated) {
      if (authentication.error.code === 'service-unavailable') {
        throw createBaseResumeUploadEndpointError(
          'authentication-unavailable',
          503,
          'Upload authentication is temporarily unavailable.',
        )
      }

      throw createBaseResumeUploadEndpointError(
        'authentication-required',
        401,
        'Authentication is required.',
      )
    }

    let candidate: BaseResumeUploadCandidate

    try {
      candidate = await readUploadCandidate(event)
    } catch (error) {
      if (
        error instanceof BaseResumeRequestBodyError &&
        error.kind === 'request-too-large'
      ) {
        throw createBaseResumeUploadEndpointError(
          'file-too-large',
          413,
          'The PDF exceeds the 10 MiB upload limit.',
        )
      }

      throw createBaseResumeUploadEndpointError(
        'invalid-upload',
        400,
        'Upload exactly one PDF using the file field.',
      )
    }

    let baseResume: Awaited<ReturnType<typeof uploadBaseResume>>

    try {
      baseResume = await uploadBaseResume(
        { client, userId: authentication.user.id },
        candidate,
      )
    } catch (error) {
      if (error instanceof BaseResumeUploadDomainError) {
        throw toDomainEndpointError(error)
      }

      if (error instanceof BaseResumeUploadServiceError) {
        throw toServiceEndpointError(error)
      }

      throw createBaseResumeUploadEndpointError(
        'base-resume-upload-unavailable',
        500,
        'Base resume upload could not be completed.',
      )
    }

    let response: UploadBaseResumeResponse

    try {
      response = uploadBaseResumeResponseSchema.parse({ baseResume })
    } catch {
      throw createBaseResumeUploadEndpointError(
        'base-resume-upload-unavailable',
        500,
        'Base resume upload could not be completed.',
      )
    }

    event.node.res.statusCode = 201

    return response
  },
)
