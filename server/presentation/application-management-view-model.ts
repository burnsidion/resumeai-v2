import type {
  ApplicationManagementData,
  ApplicationReadiness,
  ApplicationReadinessRequirement,
} from '../../shared/applications/management'
import type { ApplicationStatus } from '../../shared/applications/constraints'
import {
  applicationDetailResponseSchema,
  applicationListViewModelSchema,
  type ApplicationDetailResponse,
  type ApplicationListItemViewModel,
  type ApplicationListViewModel,
  type ApplicationReadinessViewModel,
  type ApplicationStatusTone,
} from '../../shared/applications/view-model'

const applicationDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
})

const applicationStatusPresentation = {
  applied: { label: 'Applied', tone: 'info' },
  draft: { label: 'Draft', tone: 'neutral' },
  interviewing: { label: 'Interviewing', tone: 'attention' },
  offer: { label: 'Offer', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
} as const satisfies Record<
  ApplicationStatus,
  { label: string; tone: ApplicationStatusTone }
>

const missingRequirementLabels = {
  'base-resume': 'Select an active base resume',
  'job-description': 'Add a job description',
} as const satisfies Record<ApplicationReadinessRequirement, string>

const formatDate = (timestamp: string): string =>
  applicationDateFormatter.format(new Date(timestamp))

const createReadinessViewModel = (
  readiness: ApplicationReadiness,
): ApplicationReadinessViewModel => {
  if (readiness.isReady) {
    return {
      isReady: true,
      label: 'Ready for tailoring',
      missingRequirements: [],
    }
  }

  return {
    isReady: false,
    label: 'Not ready for tailoring',
    missingRequirements: readiness.missingRequirements.map((requirement) => ({
      id: requirement,
      label: missingRequirementLabels[requirement],
    })),
  }
}

const createListItemViewModel = (
  application: ApplicationManagementData,
): ApplicationListItemViewModel => ({
  company: application.company,
  id: application.id,
  readiness: createReadinessViewModel(application.readiness),
  role: application.role,
  status: application.status,
  statusLabel: applicationStatusPresentation[application.status].label,
  statusTone: applicationStatusPresentation[application.status].tone,
  updatedAt: application.updatedAt,
  updatedLabel: formatDate(application.updatedAt),
})

export function createApplicationListViewModel(
  applications: ReadonlyArray<ApplicationManagementData>,
): ApplicationListViewModel {
  return applicationListViewModelSchema.parse({
    applications: applications.map(createListItemViewModel),
  })
}

export function createApplicationDetailResponse(
  application: ApplicationManagementData,
): ApplicationDetailResponse {
  const statusPresentation = applicationStatusPresentation[application.status]

  return applicationDetailResponseSchema.parse({
    application: {
      appliedOn: application.appliedOn,
      company: application.company,
      createdAt: application.createdAt,
      createdLabel: formatDate(application.createdAt),
      id: application.id,
      jobDescription: application.jobDescription,
      notes: application.notes,
      postingUrl: application.postingUrl,
      readiness: createReadinessViewModel(application.readiness),
      role: application.role,
      selectedBaseResume: application.selectedBaseResume
        ? {
            availabilityLabel: application.selectedBaseResume.isAvailable
              ? 'Active'
              : 'Unavailable',
            filename: application.selectedBaseResume.originalFilename,
            id: application.selectedBaseResume.id,
            isAvailable: application.selectedBaseResume.isAvailable,
          }
        : null,
      status: application.status,
      statusLabel: statusPresentation.label,
      statusTone: statusPresentation.tone,
      updatedAt: application.updatedAt,
      updatedLabel: formatDate(application.updatedAt),
    },
  })
}
