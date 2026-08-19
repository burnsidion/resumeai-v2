import { describe, expect, it } from 'vitest'

import {
  baseResumeRetirementEndpointErrorCodeSchema,
  baseResumeRetirementIdSchema,
  retireBaseResumeResponseSchema,
} from '../../shared/base-resumes/retirement'

const successfulResponse = {
  baseResume: {
    id: '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4',
    retiredAt: '2026-08-19T04:30:00+00:00',
  },
}

describe('base-resume retirement contract', () => {
  it('accepts the safe successful result', () => {
    expect(retireBaseResumeResponseSchema.parse(successfulResponse)).toEqual(
      successfulResponse,
    )
  })

  it('does not expose ownership, slot, storage, or source metadata', () => {
    const result = retireBaseResumeResponseSchema.safeParse({
      baseResume: {
        ...successfulResponse.baseResume,
        activeSlot: null,
        storageObjectKey: 'private/base-resume.pdf',
        userId: '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0',
      },
    })

    expect(result.success).toBe(false)
  })

  it('requires a UUID base-resume identifier', () => {
    expect(
      baseResumeRetirementIdSchema.parse(successfulResponse.baseResume.id),
    ).toBe(successfulResponse.baseResume.id)
    expect(baseResumeRetirementIdSchema.safeParse('not-a-uuid').success).toBe(
      false,
    )
  })

  it('rejects a retirement timestamp without an explicit offset', () => {
    expect(
      retireBaseResumeResponseSchema.safeParse({
        baseResume: {
          ...successfulResponse.baseResume,
          retiredAt: '2026-08-19T04:30:00',
        },
      }).success,
    ).toBe(false)
  })

  it.each([
    'authentication-required',
    'authentication-unavailable',
    'base-resume-retirement-unavailable',
    'base-resume-unavailable',
    'invalid-base-resume-id',
  ])('accepts the sanitized endpoint error code %s', (code) => {
    expect(baseResumeRetirementEndpointErrorCodeSchema.parse(code)).toBe(code)
  })

  it('rejects arbitrary provider error codes', () => {
    expect(
      baseResumeRetirementEndpointErrorCodeSchema.safeParse(
        'database-update-failed',
      ).success,
    ).toBe(false)
  })
})
