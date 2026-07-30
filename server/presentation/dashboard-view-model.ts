import type {
  ApplicationStatus,
  DashboardProductData,
} from '../../shared/product-data/dashboard'
import {
  dashboardViewModelSchema,
  type DashboardApplicationStatusTone,
  type DashboardAttentionViewModel,
  type DashboardQuickActionViewModel,
  type DashboardViewModel,
} from '../../shared/dashboard/view-model'

const dashboardDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const applicationStatusPresentation = {
  applied: {
    label: 'Applied',
    tone: 'info',
  },
  draft: {
    label: 'Draft',
    tone: 'neutral',
  },
  interviewing: {
    label: 'Interviewing',
    tone: 'attention',
  },
  offer: {
    label: 'Offer',
    tone: 'success',
  },
  rejected: {
    label: 'Rejected',
    tone: 'danger',
  },
  withdrawn: {
    label: 'Withdrawn',
    tone: 'neutral',
  },
} as const satisfies Record<
  ApplicationStatus,
  {
    label: string
    tone: DashboardApplicationStatusTone
  }
>

const formatCount = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

const formatDate = (timestamp: string): string =>
  dashboardDateFormatter.format(new Date(timestamp))

const getCompanyInitial = (company: string): string =>
  Array.from(company.trim())[0]?.toLocaleUpperCase('en-US') ?? '?'

const createAttentionViewModel = (
  productData: DashboardProductData,
): DashboardAttentionViewModel => {
  if (productData.readyForReview) {
    return {
      applicationId: productData.readyForReview.applicationId,
      company: productData.readyForReview.company,
      description: 'Review your tailored resume before you finalize it.',
      eyebrow: 'Ready for review',
      kind: 'ready-for-review',
      primaryAction: {
        availability: 'unavailable',
        label: 'Review working copy',
      },
      role: productData.readyForReview.role,
      secondaryAction: {
        availability: 'unavailable',
        label: 'Open application',
      },
      status: 'Working copy ready',
      workingCopyId: productData.readyForReview.workingCopyId,
    }
  }

  if (productData.baseResumes.activeCount === 0) {
    return {
      action: {
        availability: 'unavailable',
        label: 'Upload base resume',
      },
      description:
        'A base resume gives future applications and tailoring a source document.',
      eyebrow: 'Next step',
      kind: 'guidance',
      title: 'Add a base resume',
    }
  }

  if (productData.recentApplications.length === 0) {
    return {
      action: {
        availability: 'unavailable',
        label: 'Create application',
      },
      description:
        'Applications keep each role, status, and submitted resume together.',
      eyebrow: 'Next step',
      kind: 'guidance',
      title: 'Create your first application',
    }
  }

  return {
    action: null,
    description: 'No tailored resume is waiting for your review right now.',
    eyebrow: 'All caught up',
    kind: 'guidance',
    title: "You're up to date",
  }
}

const createSummaryMessage = (productData: DashboardProductData): string => {
  if (productData.readyForReview) {
    return 'You have one resume ready to review.'
  }

  if (productData.baseResumes.activeCount === 0) {
    return "Upload a base resume when you're ready."
  }

  if (productData.recentApplications.length === 0) {
    return "Create your first application when you're ready."
  }

  return 'No resume needs your review right now.'
}

const createQuickActions = (
  productData: DashboardProductData,
): ReadonlyArray<DashboardQuickActionViewModel> => [
  {
    availability: 'unavailable',
    description: 'Start when you are ready',
    icon: 'create',
    id: 'create-application',
    label: 'Create application',
  },
  {
    availability: 'unavailable',
    description: `${productData.baseResumes.activeCount} of ${productData.baseResumes.activeLimit} resumes`,
    icon: 'upload',
    id: 'upload-base-resume',
    label: 'Upload base resume',
  },
  {
    availability: 'unavailable',
    description:
      productData.recentApplications.length === 0
        ? 'No applications yet'
        : 'Return to recent work',
    icon: 'applications',
    id: 'view-applications',
    label: 'View applications',
  },
]

export function createDashboardViewModel(
  productData: DashboardProductData,
): DashboardViewModel {
  const remainingSlots =
    productData.baseResumes.activeLimit - productData.baseResumes.activeCount

  return dashboardViewModelSchema.parse({
    attention: createAttentionViewModel(productData),
    baseResumes: {
      activeCount: productData.baseResumes.activeCount,
      activeLimit: productData.baseResumes.activeLimit,
      countLabel: `${productData.baseResumes.activeCount} of ${productData.baseResumes.activeLimit} resumes`,
      emptyMessage:
        productData.baseResumes.items.length === 0
          ? 'No base resumes have been added yet.'
          : null,
      items: productData.baseResumes.items.map((resume) => ({
        addedLabel: `Added ${formatDate(resume.createdAt)}`,
        createdAt: resume.createdAt,
        filename: resume.originalFilename,
        id: resume.id,
        statusLabel: 'Active',
      })),
      remainingSlots,
      remainingSlotsLabel:
        remainingSlots === 0
          ? null
          : `${formatCount(remainingSlots, 'resume slot', 'resume slots')} available`,
    },
    quickActions: createQuickActions(productData),
    recentApplications: {
      emptyMessage:
        productData.recentApplications.length === 0
          ? 'No applications have been created yet.'
          : null,
      items: productData.recentApplications.map((application) => ({
        company: application.company,
        dateLabel: formatDate(application.updatedAt),
        dateTime: application.updatedAt,
        id: application.id,
        initial: getCompanyInitial(application.company),
        role: application.role,
        statusLabel: applicationStatusPresentation[application.status].label,
        statusTone: applicationStatusPresentation[application.status].tone,
      })),
    },
    summary: {
      activeApplicationCount: productData.applicationSummary.activeCount,
      activeApplicationsLabel: `${formatCount(
        productData.applicationSummary.activeCount,
        'active application',
        'active applications',
      )}`,
      heading: 'Welcome back.',
      interviewCount: productData.applicationSummary.interviewCount,
      interviewsLabel: formatCount(
        productData.applicationSummary.interviewCount,
        'interview',
        'interviews',
      ),
      message: createSummaryMessage(productData),
    },
  })
}
