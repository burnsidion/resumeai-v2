import { describe, expect, it } from 'vitest'

import {
  APPLICATION_STATUSES,
  applicationStatusSchema,
  MAXIMUM_APPLICATION_COMPANY_LENGTH,
  MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH,
  MAXIMUM_APPLICATION_NOTES_LENGTH,
  MAXIMUM_APPLICATION_POSTING_URL_LENGTH,
  MAXIMUM_APPLICATION_ROLE_LENGTH,
} from '../../shared/applications/constraints'
import { applicationManagementEndpointErrorCodeSchema } from '../../shared/applications/errors'
import {
  applicationManagementDataSchema,
  applicationReadinessSchema,
  createApplicationRequestSchema,
  updateApplicationRequestSchema,
} from '../../shared/applications/management'
import { applicationStatusSchema as dashboardApplicationStatusSchema } from '../../shared/product-data/dashboard'

const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'

describe('application management input contracts', () => {
  it('normalizes a complete creation request and defaults omitted values', () => {
    expect(
      createApplicationRequestSchema.parse({
        company: '  Northstar Labs  ',
        jobDescription: '  Build accessible products.  ',
        notes: '   ',
        postingUrl: '  https://example.com/jobs/123  ',
        role: '  Senior Frontend Engineer  ',
        selectedBaseResumeId: baseResumeId,
      }),
    ).toEqual({
      company: 'Northstar Labs',
      jobDescription: 'Build accessible products.',
      notes: null,
      postingUrl: 'https://example.com/jobs/123',
      role: 'Senior Frontend Engineer',
      selectedBaseResumeId: baseResumeId,
    })

    expect(
      createApplicationRequestSchema.parse({
        company: 'Northstar Labs',
        role: 'Senior Frontend Engineer',
      }),
    ).toEqual({
      company: 'Northstar Labs',
      jobDescription: null,
      notes: null,
      postingUrl: null,
      role: 'Senior Frontend Engineer',
      selectedBaseResumeId: null,
    })
  })

  it.each(['company', 'role'] as const)(
    'requires a normalized non-empty %s',
    (field) => {
      const input = {
        company: 'Northstar Labs',
        role: 'Senior Frontend Engineer',
        [field]: '   ',
      }

      expect(createApplicationRequestSchema.safeParse(input).success).toBe(
        false,
      )
    },
  )

  it.each([
    ['company', 'x'.repeat(MAXIMUM_APPLICATION_COMPANY_LENGTH + 1)],
    ['role', 'x'.repeat(MAXIMUM_APPLICATION_ROLE_LENGTH + 1)],
    [
      'jobDescription',
      'x'.repeat(MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH + 1),
    ],
    ['notes', 'x'.repeat(MAXIMUM_APPLICATION_NOTES_LENGTH + 1)],
    [
      'postingUrl',
      `https://example.com/${'x'.repeat(MAXIMUM_APPLICATION_POSTING_URL_LENGTH)}`,
    ],
  ])('rejects an overlong %s', (field, value) => {
    expect(
      createApplicationRequestSchema.safeParse({
        company: 'Northstar Labs',
        role: 'Senior Frontend Engineer',
        [field]: value,
      }).success,
    ).toBe(false)
  })

  it.each(['javascript:alert(1)', 'ftp://example.com/job', 'not a URL'])(
    'rejects the unsupported posting URL %s',
    (postingUrl) => {
      expect(
        createApplicationRequestSchema.safeParse({
          company: 'Northstar Labs',
          postingUrl,
          role: 'Senior Frontend Engineer',
        }).success,
      ).toBe(false)
    },
  )

  it.each([
    'status',
    'userId',
    'createdAt',
    'updatedAt',
    'submittedFinalizedResumeId',
  ])('rejects the server-owned creation field %s', (field) => {
    expect(
      createApplicationRequestSchema.safeParse({
        company: 'Northstar Labs',
        role: 'Senior Frontend Engineer',
        [field]: 'untrusted',
      }).success,
    ).toBe(false)
  })

  it('accepts and normalizes a non-empty update without filling omitted fields', () => {
    expect(
      updateApplicationRequestSchema.parse({
        appliedOn: '2026-08-20',
        jobDescription: '   ',
        selectedBaseResumeId: null,
        status: 'applied',
      }),
    ).toEqual({
      appliedOn: '2026-08-20',
      jobDescription: null,
      selectedBaseResumeId: null,
      status: 'applied',
    })
  })

  it('rejects empty updates, invalid dates, statuses, IDs, and immutable fields', () => {
    expect(updateApplicationRequestSchema.safeParse({}).success).toBe(false)
    expect(
      updateApplicationRequestSchema.safeParse({ company: undefined }).success,
    ).toBe(false)
    expect(
      updateApplicationRequestSchema.safeParse({ appliedOn: '08/20/2026' })
        .success,
    ).toBe(false)
    expect(
      updateApplicationRequestSchema.safeParse({ status: 'archived' }).success,
    ).toBe(false)
    expect(
      updateApplicationRequestSchema.safeParse({
        selectedBaseResumeId: 'not-a-uuid',
      }).success,
    ).toBe(false)
    expect(
      updateApplicationRequestSchema.safeParse({ userId: baseResumeId })
        .success,
    ).toBe(false)
  })
})

describe('application management product contracts', () => {
  it('owns one approved status vocabulary without making dashboard its source', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'draft',
      'applied',
      'interviewing',
      'offer',
      'rejected',
      'withdrawn',
    ])
    expect(dashboardApplicationStatusSchema).toBe(applicationStatusSchema)
  })

  it('enforces readiness state and deterministic missing-requirement order', () => {
    expect(
      applicationReadinessSchema.safeParse({
        isReady: false,
        missingRequirements: ['job-description', 'base-resume'],
      }).success,
    ).toBe(true)
    expect(
      applicationReadinessSchema.safeParse({
        isReady: false,
        missingRequirements: ['base-resume', 'job-description'],
      }).success,
    ).toBe(false)
    expect(
      applicationReadinessSchema.safeParse({
        isReady: true,
        missingRequirements: ['base-resume'],
      }).success,
    ).toBe(false)
  })

  it('accepts historical selected-resume identity while deriving availability honestly', () => {
    const result = applicationManagementDataSchema.parse({
      appliedOn: null,
      company: 'Northstar Labs',
      createdAt: '2026-08-20T18:00:00+00:00',
      id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
      jobDescription: 'Build accessible products.',
      notes: null,
      postingUrl: null,
      readiness: {
        isReady: false,
        missingRequirements: ['base-resume'],
      },
      role: 'Senior Frontend Engineer',
      selectedBaseResume: {
        activeSlot: null,
        id: baseResumeId,
        isAvailable: false,
        originalFilename: 'Frontend Engineering.pdf',
        retiredAt: '2026-08-21T18:00:00+00:00',
      },
      status: 'draft',
      updatedAt: '2026-08-21T18:00:00+00:00',
    })

    expect(result.selectedBaseResume).toMatchObject({
      id: baseResumeId,
      isAvailable: false,
      originalFilename: 'Frontend Engineering.pdf',
    })
    expect(result).not.toHaveProperty('userId')
    expect(result.selectedBaseResume).not.toHaveProperty('storageObjectKey')
  })

  it('rejects a selected resume whose availability contradicts its lifecycle', () => {
    const result = applicationManagementDataSchema.safeParse({
      appliedOn: null,
      company: 'Northstar Labs',
      createdAt: '2026-08-20T18:00:00+00:00',
      id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
      jobDescription: null,
      notes: null,
      postingUrl: null,
      readiness: {
        isReady: false,
        missingRequirements: ['job-description'],
      },
      role: 'Senior Frontend Engineer',
      selectedBaseResume: {
        activeSlot: null,
        id: baseResumeId,
        isAvailable: true,
        originalFilename: 'Frontend Engineering.pdf',
        retiredAt: null,
      },
      status: 'draft',
      updatedAt: '2026-08-20T18:00:00+00:00',
    })

    expect(result.success).toBe(false)
  })

  it('rejects application data whose update time predates creation', () => {
    const result = applicationManagementDataSchema.safeParse({
      appliedOn: null,
      company: 'Northstar Labs',
      createdAt: '2026-08-21T18:00:00+00:00',
      id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
      jobDescription: null,
      notes: null,
      postingUrl: null,
      readiness: {
        isReady: false,
        missingRequirements: ['job-description', 'base-resume'],
      },
      role: 'Senior Frontend Engineer',
      selectedBaseResume: null,
      status: 'draft',
      updatedAt: '2026-08-20T18:00:00+00:00',
    })

    expect(result.success).toBe(false)
  })

  it('defines the stable endpoint error vocabulary before transport mapping', () => {
    expect(
      applicationManagementEndpointErrorCodeSchema.parse(
        'selected-base-resume-unavailable',
      ),
    ).toBe('selected-base-resume-unavailable')
    expect(
      applicationManagementEndpointErrorCodeSchema.safeParse(
        'raw-postgrest-error',
      ).success,
    ).toBe(false)
  })
})
