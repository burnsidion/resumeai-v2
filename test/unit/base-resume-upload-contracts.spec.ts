import { describe, expect, it } from 'vitest'

import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
  baseResumeUploadEndpointErrorCodeSchema,
  MAXIMUM_BASE_RESUME_FILENAME_LENGTH,
  uploadBaseResumeResponseSchema,
} from '../../shared/base-resumes/upload'

const successfulResponse = {
  baseResume: {
    activeSlot: 2,
    createdAt: '2026-08-04T08:30:00+00:00',
    id: '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4',
    originalFilename: 'Frontend Engineer.pdf',
  },
}

describe('base-resume upload contract', () => {
  it('accepts the safe successful result', () => {
    expect(uploadBaseResumeResponseSchema.parse(successfulResponse)).toEqual(
      successfulResponse,
    )
  })

  it('does not expose ownership, storage, or integrity metadata', () => {
    const result = uploadBaseResumeResponseSchema.safeParse({
      baseResume: {
        ...successfulResponse.baseResume,
        contentSha256: 'a'.repeat(64),
        storageObjectKey:
          '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0/5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4.pdf',
        userId: '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0',
      },
    })

    expect(result.success).toBe(false)
  })

  it('measures the approved filename limit in Unicode characters', () => {
    expect(
      baseResumeOriginalFilenameSchema.safeParse(
        '📄'.repeat(MAXIMUM_BASE_RESUME_FILENAME_LENGTH),
      ).success,
    ).toBe(true)
    expect(
      baseResumeOriginalFilenameSchema.safeParse(
        '📄'.repeat(MAXIMUM_BASE_RESUME_FILENAME_LENGTH + 1),
      ).success,
    ).toBe(false)
  })

  it.each([1, 2, 3])('accepts active slot %s', (slot) => {
    expect(activeBaseResumeSlotSchema.parse(slot)).toBe(slot)
  })

  it.each([0, 4, 1.5, null])('rejects invalid active slot %s', (slot) => {
    expect(activeBaseResumeSlotSchema.safeParse(slot).success).toBe(false)
  })

  it.each([
    'active-resume-limit-reached',
    'authentication-required',
    'authentication-unavailable',
    'base-resume-upload-unavailable',
    'file-too-large',
    'invalid-filename',
    'invalid-pdf',
    'invalid-upload',
    'unsupported-file-type',
  ])('accepts the sanitized endpoint error code %s', (code) => {
    expect(baseResumeUploadEndpointErrorCodeSchema.parse(code)).toBe(code)
  })

  it('rejects arbitrary provider error codes', () => {
    expect(
      baseResumeUploadEndpointErrorCodeSchema.safeParse(
        'storage-provider-timeout',
      ).success,
    ).toBe(false)
  })
})
