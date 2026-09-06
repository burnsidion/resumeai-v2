import { describe, expect, it } from 'vitest'

import type { ApplicationManagementData } from '../../shared/applications/management'
import {
  applicationDetailResponseSchema,
  applicationListViewModelSchema,
} from '../../shared/applications/view-model'
import {
  createApplicationDetailResponse,
  createApplicationListViewModel,
} from '../../server/presentation/application-management-view-model'

const createApplication = (
  overrides: Partial<ApplicationManagementData> = {},
): ApplicationManagementData => ({
  appliedOn: '2026-08-20',
  company: 'Northstar Labs',
  createdAt: '2026-08-19T18:00:00+00:00',
  id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
  jobDescription: 'Build calm, accessible product experiences.',
  notes: 'Follow up with the hiring manager.',
  postingUrl: 'https://example.com/jobs/123',
  readiness: { isReady: true, missingRequirements: [] },
  role: 'Senior Frontend Engineer',
  selectedBaseResume: {
    activeSlot: 1,
    id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
    isAvailable: true,
    originalFilename: 'Frontend Engineering.pdf',
    retiredAt: null,
  },
  status: 'interviewing',
  updatedAt: '2026-08-20T18:00:00+00:00',
  ...overrides,
})

describe('application management presentation mapper', () => {
  it('maps a deterministic list representation without detail-only data', () => {
    const viewModel = createApplicationListViewModel([createApplication()])

    expect(applicationListViewModelSchema.parse(viewModel)).toEqual(viewModel)
    expect(viewModel.applications).toEqual([
      {
        company: 'Northstar Labs',
        id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
        readiness: {
          isReady: true,
          label: 'Ready for tailoring',
          missingRequirements: [],
        },
        role: 'Senior Frontend Engineer',
        status: 'interviewing',
        statusLabel: 'Interviewing',
        statusTone: 'attention',
        updatedAt: '2026-08-20T18:00:00+00:00',
        updatedLabel: 'Aug 20, 2026',
      },
    ])
    expect(viewModel.applications[0]).not.toHaveProperty('jobDescription')
    expect(viewModel.applications[0]).not.toHaveProperty('notes')
    expect(viewModel.applications[0]).not.toHaveProperty('postingUrl')
    expect(viewModel.applications[0]).not.toHaveProperty('selectedBaseResume')
  })

  it('maps the complete safe detail representation', () => {
    const response = createApplicationDetailResponse(createApplication())

    expect(applicationDetailResponseSchema.parse(response)).toEqual(response)
    expect(response.application).toMatchObject({
      createdLabel: 'Aug 19, 2026',
      jobDescription: 'Build calm, accessible product experiences.',
      notes: 'Follow up with the hiring manager.',
      selectedBaseResume: {
        availabilityLabel: 'Active',
        filename: 'Frontend Engineering.pdf',
        isAvailable: true,
      },
      updatedLabel: 'Aug 20, 2026',
    })
    expect(response.application).not.toHaveProperty('userId')
    expect(response.application.selectedBaseResume).not.toHaveProperty(
      'storageObjectKey',
    )
  })

  it('keeps an unavailable historical resume visible without calling it active', () => {
    const response = createApplicationDetailResponse(
      createApplication({
        readiness: {
          isReady: false,
          missingRequirements: ['base-resume'],
        },
        selectedBaseResume: {
          activeSlot: null,
          id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
          isAvailable: false,
          originalFilename: 'Frontend Engineering.pdf',
          retiredAt: '2026-08-21T18:00:00+00:00',
        },
      }),
    )

    expect(response.application.selectedBaseResume).toEqual({
      availabilityLabel: 'Unavailable',
      filename: 'Frontend Engineering.pdf',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      isAvailable: false,
    })
    expect(response.application.readiness).toEqual({
      isReady: false,
      label: 'Not ready for tailoring',
      missingRequirements: [
        { id: 'base-resume', label: 'Select an active base resume' },
      ],
    })
  })

  it('maps both missing requirements in approved order and supports an empty list', () => {
    const detail = createApplicationDetailResponse(
      createApplication({
        jobDescription: null,
        readiness: {
          isReady: false,
          missingRequirements: ['job-description', 'base-resume'],
        },
        selectedBaseResume: null,
      }),
    )

    expect(detail.application.readiness).toMatchObject({
      isReady: false,
      missingRequirements: [
        { id: 'job-description', label: 'Add a job description' },
        { id: 'base-resume', label: 'Select an active base resume' },
      ],
    })
    expect(createApplicationListViewModel([])).toEqual({ applications: [] })
  })

  it.each([
    ['draft', 'Draft', 'neutral'],
    ['applied', 'Applied', 'info'],
    ['interviewing', 'Interviewing', 'attention'],
    ['offer', 'Offer', 'success'],
    ['rejected', 'Rejected', 'danger'],
    ['withdrawn', 'Withdrawn', 'neutral'],
  ] as const)('maps %s to its label and tone', (status, label, tone) => {
    const application = createApplicationListViewModel([
      createApplication({ status }),
    ]).applications[0]

    expect(application).toMatchObject({
      status,
      statusLabel: label,
      statusTone: tone,
    })
  })
})
