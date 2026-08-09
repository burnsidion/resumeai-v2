import {
  BASE_RESUME_CONTENT_TYPE,
  BASE_RESUME_PDF_SIGNATURE_BYTES,
  MAXIMUM_BASE_RESUME_SIZE_BYTES,
} from '~~/shared/base-resumes/constraints'
import {
  baseResumeOriginalFilenameSchema,
  type BaseResumeUploadEndpointErrorCode,
} from '~~/shared/base-resumes/upload'

export interface ValidBaseResumeSelection {
  file: File
  normalizedFilename: string
}

export type BaseResumeSelectionValidationResult =
  | {
      valid: false
      code: Extract<
        BaseResumeUploadEndpointErrorCode,
        | 'file-too-large'
        | 'invalid-filename'
        | 'invalid-pdf'
        | 'invalid-upload'
        | 'unsupported-file-type'
      >
    }
  | {
      valid: true
      selection: ValidBaseResumeSelection
    }

const hasPdfSignature = (bytes: Uint8Array): boolean =>
  BASE_RESUME_PDF_SIGNATURE_BYTES.every((byte, index) => bytes[index] === byte)

export async function validateBaseResumeSelection(
  file: File,
): Promise<BaseResumeSelectionValidationResult> {
  const normalizedFilename = file.name.trim()

  if (!baseResumeOriginalFilenameSchema.safeParse(normalizedFilename).success) {
    return { code: 'invalid-filename', valid: false }
  }

  if (file.type !== BASE_RESUME_CONTENT_TYPE) {
    return { code: 'unsupported-file-type', valid: false }
  }

  if (file.size === 0) {
    return { code: 'invalid-pdf', valid: false }
  }

  if (file.size > MAXIMUM_BASE_RESUME_SIZE_BYTES) {
    return { code: 'file-too-large', valid: false }
  }

  try {
    const signature = new Uint8Array(
      await file.slice(0, BASE_RESUME_PDF_SIGNATURE_BYTES.length).arrayBuffer(),
    )

    if (!hasPdfSignature(signature)) {
      return { code: 'invalid-pdf', valid: false }
    }
  } catch {
    return { code: 'invalid-upload', valid: false }
  }

  return {
    selection: {
      file,
      normalizedFilename,
    },
    valid: true,
  }
}
