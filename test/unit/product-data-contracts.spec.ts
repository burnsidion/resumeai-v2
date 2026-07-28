import { describe, expect, it } from 'vitest'

import {
  applicationStatusSchema,
  dashboardProductDataSchema,
} from '../../shared/product-data/dashboard'

const populatedProductData = {
  applicationSummary: {
    activeCount: 4,
    interviewCount: 1,
  },
  baseResumes: {
    activeCount: 2,
    activeLimit: 3,
    items: [
      {
        activeSlot: 1,
        createdAt: '2026-07-20T18:00:00+00:00',
        id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
        originalFilename: 'Frontend Engineering.pdf',
      },
      {
        activeSlot: 2,
        createdAt: '2026-07-14T18:00:00+00:00',
        id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
        originalFilename: 'Accessibility Specialist.pdf',
      },
    ],
  },
  readyForReview: {
    applicationId: 'dd87d5fd-ad50-46da-b07f-b5470e03aca7',
    company: 'Northstar Labs',
    role: 'Senior Frontend Engineer',
    state: 'awaiting_review',
    updatedAt: '2026-07-27T18:00:00+00:00',
    workingCopyId: '4ee6178a-a5b7-4f0a-8ff9-9b04756846a8',
  },
  recentApplications: [
    {
      appliedOn: '2026-07-22',
      company: 'Lantern Health',
      createdAt: '2026-07-20T18:00:00+00:00',
      id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
      role: 'Product Engineer',
      status: 'applied',
      updatedAt: '2026-07-22T18:00:00+00:00',
    },
  ],
}

describe('application status contract', () => {
  it.each([
    'draft',
    'applied',
    'interviewing',
    'offer',
    'rejected',
    'withdrawn',
  ])('accepts the approved %s status', (status) => {
    expect(applicationStatusSchema.parse(status)).toBe(status)
  })

  it('rejects an unsupported status', () => {
    expect(applicationStatusSchema.safeParse('archived').success).toBe(false)
  })
})

describe('dashboard product-data contract', () => {
  it('accepts a populated product-data snapshot', () => {
    expect(dashboardProductDataSchema.parse(populatedProductData)).toEqual(
      populatedProductData,
    )
  })

  it('represents the zero state without inventing product data', () => {
    const zeroState = {
      applicationSummary: {
        activeCount: 0,
        interviewCount: 0,
      },
      baseResumes: {
        activeCount: 0,
        activeLimit: 3,
        items: [],
      },
      readyForReview: null,
      recentApplications: [],
    }

    expect(dashboardProductDataSchema.parse(zeroState)).toEqual(zeroState)
  })

  it('accepts partial product history without requiring review work', () => {
    const partialState = {
      ...populatedProductData,
      readyForReview: null,
    }

    expect(dashboardProductDataSchema.parse(partialState)).toEqual(partialState)
  })

  it('rejects inconsistent derived counts', () => {
    const result = dashboardProductDataSchema.safeParse({
      ...populatedProductData,
      applicationSummary: {
        activeCount: 0,
        interviewCount: 1,
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects fields that would leak database implementation details', () => {
    const result = dashboardProductDataSchema.safeParse({
      ...populatedProductData,
      recentApplications: [
        {
          ...populatedProductData.recentApplications[0],
          userId: '7bd6a80d-1a72-47b7-b55f-60a55507fd2a',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('does not invent a primary-resume concept from the active slot', () => {
    const result = dashboardProductDataSchema.parse(populatedProductData)

    expect(result.baseResumes.items[0]).not.toHaveProperty('primary')
  })
})
