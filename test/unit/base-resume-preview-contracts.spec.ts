import { describe, expect, it } from 'vitest'

import {
  BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
  baseResumePreviewEndpointErrorCodeSchema,
  baseResumePreviewResponseSchema,
} from '../../shared/base-resumes/preview'

const response = {
  preview: {
    baseResumeId: '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4',
    expiresAt: '2026-08-22T05:05:00.000Z',
    originalFilename: 'Frontend Engineer.pdf',
    url: 'https://example.supabase.co/storage/v1/object/sign/base-resumes/file.pdf?token=test',
  },
}

describe('base-resume preview contract', () => {
  it('uses the approved five-minute temporary-access lifetime', () => {
    expect(BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS).toBe(300)
  })

  it('accepts the safe temporary preview response', () => {
    expect(baseResumePreviewResponseSchema.parse(response)).toEqual(response)
  })

  it('accepts a loopback HTTP URL for the isolated local environment', () => {
    expect(
      baseResumePreviewResponseSchema.safeParse({
        preview: {
          ...response.preview,
          url: 'http://127.0.0.1:54321/storage/v1/object/sign/base-resumes/file.pdf?token=test',
        },
      }).success,
    ).toBe(true)
  })

  it.each(['javascript:alert(1)', 'file:///private/resume.pdf'])(
    'rejects a non-HTTP preview URL: %s',
    (url) => {
      expect(
        baseResumePreviewResponseSchema.safeParse({
          preview: { ...response.preview, url },
        }).success,
      ).toBe(false)
    },
  )

  it('does not expose ownership or Storage identity', () => {
    expect(
      baseResumePreviewResponseSchema.safeParse({
        preview: {
          ...response.preview,
          storageObjectKey: 'user-id/resume-id.pdf',
          userId: '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0',
        },
      }).success,
    ).toBe(false)
  })

  it.each([
    'authentication-required',
    'authentication-unavailable',
    'base-resume-preview-unavailable',
    'base-resume-unavailable',
    'invalid-base-resume-id',
  ])('accepts the sanitized endpoint error code %s', (code) => {
    expect(baseResumePreviewEndpointErrorCodeSchema.parse(code)).toBe(code)
  })

  it('rejects arbitrary provider error codes', () => {
    expect(
      baseResumePreviewEndpointErrorCodeSchema.safeParse(
        'storage-signing-failed',
      ).success,
    ).toBe(false)
  })
})
