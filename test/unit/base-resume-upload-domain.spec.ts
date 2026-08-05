import { describe, expect, it } from 'vitest'

import {
  BASE_RESUME_CONTENT_TYPE,
  BaseResumeUploadDomainError,
  calculateBaseResumeSha256,
  createBaseResumeObjectKey,
  findLowestAvailableBaseResumeSlot,
  MAXIMUM_BASE_RESUME_SIZE_BYTES,
  validateBaseResumeUpload,
} from '../../server/domain/base-resumes/upload'
import { MAXIMUM_BASE_RESUME_FILENAME_LENGTH } from '../../shared/base-resumes/upload'

const createPdfBytes = (body = 'ResumAI'): Uint8Array =>
  new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`)

const createCandidate = () => ({
  bytes: createPdfBytes(),
  contentType: BASE_RESUME_CONTENT_TYPE,
  originalFilename: 'resume.pdf',
})

const expectDomainError = (
  action: () => unknown,
  code: BaseResumeUploadDomainError['code'],
): void => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumeUploadDomainError)
    expect((error as BaseResumeUploadDomainError).code).toBe(code)
    return
  }

  throw new Error(`Expected the domain error ${code}.`)
}

describe('base-resume upload validation', () => {
  it('accepts a PDF candidate and trims display-only filename whitespace', () => {
    const candidate = {
      ...createCandidate(),
      originalFilename: '  Frontend Engineer.pdf  ',
    }

    expect(validateBaseResumeUpload(candidate)).toEqual({
      ...candidate,
      originalFilename: 'Frontend Engineer.pdf',
    })
  })

  it.each([
    '',
    '   ',
    'nested/resume.pdf',
    'nested\\resume.pdf',
    'resume\u0000.pdf',
    `${'a'.repeat(MAXIMUM_BASE_RESUME_FILENAME_LENGTH - 3)}.pdf`,
  ])('rejects the unsafe filename %j', (originalFilename) => {
    expectDomainError(
      () =>
        validateBaseResumeUpload({ ...createCandidate(), originalFilename }),
      'invalid-filename',
    )
  })

  it('accepts a filename at the approved character limit', () => {
    const originalFilename = `${'a'.repeat(
      MAXIMUM_BASE_RESUME_FILENAME_LENGTH - 4,
    )}.pdf`

    expect(
      validateBaseResumeUpload({ ...createCandidate(), originalFilename })
        .originalFilename,
    ).toBe(originalFilename)
  })

  it('rejects a non-PDF declared content type', () => {
    expectDomainError(
      () =>
        validateBaseResumeUpload({
          ...createCandidate(),
          contentType: 'text/plain',
        }),
      'unsupported-file-type',
    )
  })

  it('rejects an empty file', () => {
    expectDomainError(
      () =>
        validateBaseResumeUpload({
          ...createCandidate(),
          bytes: new Uint8Array(),
        }),
      'empty-file',
    )
  })

  it('accepts the exact 10 MiB size boundary', () => {
    const bytes = new Uint8Array(MAXIMUM_BASE_RESUME_SIZE_BYTES)
    bytes.set(createPdfBytes())

    expect(
      validateBaseResumeUpload({ ...createCandidate(), bytes }).bytes,
    ).toBe(bytes)
  })

  it('rejects a file larger than 10 MiB', () => {
    const bytes = new Uint8Array(MAXIMUM_BASE_RESUME_SIZE_BYTES + 1)
    bytes.set(createPdfBytes())

    expectDomainError(
      () => validateBaseResumeUpload({ ...createCandidate(), bytes }),
      'file-too-large',
    )
  })

  it('rejects PDF metadata paired with non-PDF bytes', () => {
    expectDomainError(
      () =>
        validateBaseResumeUpload({
          ...createCandidate(),
          bytes: new TextEncoder().encode('not a PDF'),
        }),
      'invalid-pdf',
    )
  })
})

describe('base-resume upload identity and integrity rules', () => {
  it.each([
    { occupied: [], expected: 1 },
    { occupied: [1] as const, expected: 2 },
    { occupied: [1, 3] as const, expected: 2 },
    { occupied: [1, 2] as const, expected: 3 },
    { occupied: [1, 2, 3] as const, expected: null },
  ])(
    'selects $expected from occupied slots $occupied',
    ({ expected, occupied }) => {
      expect(findLowestAvailableBaseResumeSlot(occupied)).toBe(expected)
    },
  )

  it('constructs the migration-controlled deterministic object key', () => {
    expect(
      createBaseResumeObjectKey(
        '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0',
        '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4',
      ),
    ).toBe(
      '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0/5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4.pdf',
    )
  })

  it('calculates a lowercase SHA-256 hash over the exact bytes', async () => {
    await expect(
      calculateBaseResumeSha256(new TextEncoder().encode('abc')),
    ).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
