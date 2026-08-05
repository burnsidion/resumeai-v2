import {
  baseResumeOriginalFilenameSchema,
  type ActiveBaseResumeSlot,
} from '../../../shared/base-resumes/upload'

export const BASE_RESUME_CONTENT_TYPE = 'application/pdf'
export const MAXIMUM_BASE_RESUME_SIZE_BYTES = 10 * 1024 * 1024

const activeBaseResumeSlots = [1, 2, 3] as const
const pdfSignature = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])

export type BaseResumeUploadDomainErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'invalid-filename'
  | 'invalid-pdf'
  | 'unsupported-file-type'

export interface BaseResumeUploadCandidate {
  bytes: Uint8Array
  contentType: string
  originalFilename: string
}

export interface ValidatedBaseResumeUpload {
  bytes: Uint8Array
  contentType: typeof BASE_RESUME_CONTENT_TYPE
  originalFilename: string
}

export class BaseResumeUploadDomainError extends Error {
  constructor(readonly code: BaseResumeUploadDomainErrorCode) {
    super(`Base resume upload validation failed: ${code}.`)
    this.name = 'BaseResumeUploadDomainError'
  }
}

const hasPdfSignature = (bytes: Uint8Array): boolean =>
  pdfSignature.every((byte, index) => bytes[index] === byte)

const validateOriginalFilename = (originalFilename: string): string => {
  const normalizedFilename = originalFilename.trim()
  const result = baseResumeOriginalFilenameSchema.safeParse(normalizedFilename)

  if (!result.success) {
    throw new BaseResumeUploadDomainError('invalid-filename')
  }

  return result.data
}

export function validateBaseResumeUpload(
  candidate: BaseResumeUploadCandidate,
): ValidatedBaseResumeUpload {
  const originalFilename = validateOriginalFilename(candidate.originalFilename)

  if (candidate.contentType !== BASE_RESUME_CONTENT_TYPE) {
    throw new BaseResumeUploadDomainError('unsupported-file-type')
  }

  if (candidate.bytes.byteLength === 0) {
    throw new BaseResumeUploadDomainError('empty-file')
  }

  if (candidate.bytes.byteLength > MAXIMUM_BASE_RESUME_SIZE_BYTES) {
    throw new BaseResumeUploadDomainError('file-too-large')
  }

  if (!hasPdfSignature(candidate.bytes)) {
    throw new BaseResumeUploadDomainError('invalid-pdf')
  }

  return {
    bytes: candidate.bytes,
    contentType: BASE_RESUME_CONTENT_TYPE,
    originalFilename,
  }
}

export function findLowestAvailableBaseResumeSlot(
  occupiedSlots: readonly ActiveBaseResumeSlot[],
): ActiveBaseResumeSlot | null {
  const occupiedSlotSet = new Set(occupiedSlots)

  return (
    activeBaseResumeSlots.find((slot) => !occupiedSlotSet.has(slot)) ?? null
  )
}

export const createBaseResumeObjectKey = (
  userId: string,
  baseResumeId: string,
): string => `${userId}/${baseResumeId}.pdf`

export async function calculateBaseResumeSha256(
  bytes: Uint8Array,
): Promise<string> {
  const digestInput: Uint8Array<ArrayBuffer> =
    bytes.buffer instanceof ArrayBuffer
      ? (bytes as Uint8Array<ArrayBuffer>)
      : new Uint8Array(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', digestInput)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
