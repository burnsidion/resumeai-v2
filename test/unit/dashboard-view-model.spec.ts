import { describe, expect, it } from 'vitest'

import type {
  ApplicationStatus,
  DashboardProductData,
} from '../../shared/product-data/dashboard'
import { dashboardViewModelSchema } from '../../shared/dashboard/view-model'
import { createDashboardViewModel } from '../../server/presentation/dashboard-view-model'

const createProductData = (
  overrides: Partial<DashboardProductData> = {},
): DashboardProductData => ({
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
  ...overrides,
})

describe('dashboard presentation mapper', () => {
  it('maps the populated product snapshot without inventing unsupported data', () => {
    const viewModel = createDashboardViewModel(createProductData())

    expect(dashboardViewModelSchema.parse(viewModel)).toEqual(viewModel)
    expect(viewModel.summary).toEqual({
      activeApplicationCount: 4,
      activeApplicationsLabel: '4 active applications',
      heading: 'Welcome back.',
      interviewCount: 1,
      interviewsLabel: '1 interview',
      message: 'You have one resume ready to review.',
    })
    expect(viewModel.attention).toMatchObject({
      company: 'Northstar Labs',
      kind: 'ready-for-review',
      role: 'Senior Frontend Engineer',
      status: 'Working copy ready',
    })
    expect(viewModel.recentApplications.items[0]).toMatchObject({
      dateLabel: 'Jul 22',
      dateTime: '2026-07-22T18:00:00+00:00',
      initial: 'L',
      statusLabel: 'Applied',
      statusTone: 'info',
    })
    expect(viewModel.baseResumes).toMatchObject({
      activeCount: 2,
      countLabel: '2 of 3 resumes',
      emptyMessage: null,
      remainingSlots: 1,
      remainingSlotsLabel: '1 resume slot available',
    })
    expect(viewModel.baseResumes.items[0]).toEqual({
      addedLabel: 'Added Jul 20',
      createdAt: '2026-07-20T18:00:00+00:00',
      filename: 'Frontend Engineering.pdf',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      statusLabel: 'Active',
    })
    expect(viewModel.baseResumes.items[0]).not.toHaveProperty('activeSlot')
    expect(viewModel.baseResumes.items[0]).not.toHaveProperty('primary')
    expect(viewModel).not.toHaveProperty('followUp')
  })

  it('maps zero product data to truthful guidance instead of an error', () => {
    const viewModel = createDashboardViewModel(
      createProductData({
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
      }),
    )

    expect(viewModel.summary).toEqual({
      activeApplicationCount: 0,
      activeApplicationsLabel: '0 active applications',
      heading: 'Welcome back.',
      interviewCount: 0,
      interviewsLabel: '0 interviews',
      message: "Upload a base resume when you're ready.",
    })
    expect(viewModel.attention).toEqual({
      action: {
        availability: 'unavailable',
        label: 'Upload base resume',
      },
      description:
        'A base resume gives future applications and tailoring a source document.',
      eyebrow: 'Next step',
      kind: 'guidance',
      title: 'Add a base resume',
    })
    expect(viewModel.recentApplications).toEqual({
      emptyMessage: 'No applications have been created yet.',
      items: [],
    })
    expect(viewModel.baseResumes).toEqual({
      activeCount: 0,
      activeLimit: 3,
      countLabel: '0 of 3 resumes',
      emptyMessage: 'No base resumes have been added yet.',
      items: [],
      remainingSlots: 3,
      remainingSlotsLabel: '3 resume slots available',
    })
  })

  it('guides a user with a base resume toward their first application', () => {
    const productData = createProductData({
      applicationSummary: {
        activeCount: 0,
        interviewCount: 0,
      },
      readyForReview: null,
      recentApplications: [],
    })

    const viewModel = createDashboardViewModel(productData)

    expect(viewModel.summary.message).toBe(
      "Create your first application when you're ready.",
    )
    expect(viewModel.attention).toMatchObject({
      action: {
        availability: 'unavailable',
        label: 'Create application',
      },
      kind: 'guidance',
      title: 'Create your first application',
    })
  })

  it('does not describe closed application history as a first application', () => {
    const productData = createProductData({
      applicationSummary: {
        activeCount: 0,
        interviewCount: 0,
      },
      readyForReview: null,
      recentApplications: [
        {
          appliedOn: '2026-07-01',
          company: 'Archive Systems',
          createdAt: '2026-07-01T18:00:00+00:00',
          id: '00edb2b0-a619-4f0d-917d-a81fcb0ee915',
          role: 'Frontend Engineer',
          status: 'withdrawn',
          updatedAt: '2026-07-19T18:00:00+00:00',
        },
      ],
    })

    const viewModel = createDashboardViewModel(productData)

    expect(viewModel.summary.message).toBe(
      'No resume needs your review right now.',
    )
    expect(viewModel.attention).toEqual({
      action: null,
      description: 'No tailored resume is waiting for your review right now.',
      eyebrow: 'All caught up',
      kind: 'guidance',
      title: "You're up to date",
    })
  })

  it.each<{
    label: string
    status: ApplicationStatus
    tone: string
  }>([
    { label: 'Draft', status: 'draft', tone: 'neutral' },
    { label: 'Applied', status: 'applied', tone: 'info' },
    { label: 'Interviewing', status: 'interviewing', tone: 'attention' },
    { label: 'Offer', status: 'offer', tone: 'success' },
    { label: 'Rejected', status: 'rejected', tone: 'danger' },
    { label: 'Withdrawn', status: 'withdrawn', tone: 'neutral' },
  ])(
    'maps $status to its deterministic label and tone',
    ({ label, status, tone }) => {
      const productData = createProductData({
        recentApplications: [
          {
            appliedOn: null,
            company: 'Status Systems',
            createdAt: '2026-07-20T18:00:00+00:00',
            id: 'a472517d-4c87-46b9-ac46-38116898a9aa',
            role: 'Product Engineer',
            status,
            updatedAt: '2026-07-22T18:00:00+00:00',
          },
        ],
      })

      const application =
        createDashboardViewModel(productData).recentApplications.items[0]

      expect(application).toMatchObject({
        statusLabel: label,
        statusTone: tone,
      })
    },
  )

  it('formats dates in UTC and initials from the first company character', () => {
    const productData = createProductData({
      baseResumes: {
        activeCount: 1,
        activeLimit: 3,
        items: [
          {
            activeSlot: 1,
            createdAt: '2026-07-20T23:30:00-06:00',
            id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
            originalFilename: 'Frontend Engineering.pdf',
          },
        ],
      },
      recentApplications: [
        {
          appliedOn: null,
          company: 'éclair Labs',
          createdAt: '2026-07-20T18:00:00+00:00',
          id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
          role: 'Product Engineer',
          status: 'draft',
          updatedAt: '2026-07-22T23:30:00-06:00',
        },
      ],
    })

    const viewModel = createDashboardViewModel(productData)

    expect(viewModel.baseResumes.items[0]?.addedLabel).toBe('Added Jul 21')
    expect(viewModel.recentApplications.items[0]).toMatchObject({
      dateLabel: 'Jul 23',
      initial: 'É',
    })
  })

  it('uses singular and full-capacity copy deterministically', () => {
    const productData = createProductData({
      applicationSummary: {
        activeCount: 1,
        interviewCount: 0,
      },
      baseResumes: {
        activeCount: 3,
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
            createdAt: '2026-07-19T18:00:00+00:00',
            id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
            originalFilename: 'Accessibility Specialist.pdf',
          },
          {
            activeSlot: 3,
            createdAt: '2026-07-18T18:00:00+00:00',
            id: 'f3aaf891-97db-473a-afd0-7068eca09709',
            originalFilename: 'Product Engineering.pdf',
          },
        ],
      },
      readyForReview: null,
    })

    const viewModel = createDashboardViewModel(productData)

    expect(viewModel.summary.activeApplicationsLabel).toBe(
      '1 active application',
    )
    expect(viewModel.baseResumes).toMatchObject({
      remainingSlots: 0,
      remainingSlotsLabel: null,
    })
  })
})
