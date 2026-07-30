import type { DashboardViewModel } from '../../shared/dashboard/view-model'

export const populatedDashboardViewModel = {
  attention: {
    applicationId: 'dd87d5fd-ad50-46da-b07f-b5470e03aca7',
    company: 'Northstar Labs',
    description: 'Review your tailored resume before you finalize it.',
    eyebrow: 'Ready for review',
    kind: 'ready-for-review',
    primaryAction: {
      availability: 'unavailable',
      label: 'Review working copy',
    },
    role: 'Senior Frontend Engineer',
    secondaryAction: {
      availability: 'unavailable',
      label: 'Open application',
    },
    status: 'Working copy ready',
    workingCopyId: '4ee6178a-a5b7-4f0a-8ff9-9b04756846a8',
  },
  baseResumes: {
    activeCount: 2,
    activeLimit: 3,
    countLabel: '2 of 3 resumes',
    emptyMessage: null,
    items: [
      {
        addedLabel: 'Added Jul 20',
        createdAt: '2026-07-20T18:00:00+00:00',
        filename: 'Frontend Engineering.pdf',
        id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
        statusLabel: 'Active',
      },
      {
        addedLabel: 'Added Jul 14',
        createdAt: '2026-07-14T18:00:00+00:00',
        filename: 'Accessibility Specialist.pdf',
        id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
        statusLabel: 'Active',
      },
    ],
    remainingSlots: 1,
    remainingSlotsLabel: '1 resume slot available',
  },
  quickActions: [
    {
      availability: 'unavailable',
      description: 'Start when you are ready',
      icon: 'create',
      id: 'create-application',
      label: 'Create application',
    },
    {
      availability: 'unavailable',
      description: '2 of 3 resumes',
      icon: 'upload',
      id: 'upload-base-resume',
      label: 'Upload base resume',
    },
    {
      availability: 'unavailable',
      description: 'Return to recent work',
      icon: 'applications',
      id: 'view-applications',
      label: 'View applications',
    },
  ],
  recentApplications: {
    emptyMessage: null,
    items: [
      {
        company: 'Lantern Health',
        dateLabel: 'Jul 22',
        dateTime: '2026-07-22T18:00:00+00:00',
        id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
        initial: 'L',
        role: 'Product Engineer',
        statusLabel: 'Applied',
        statusTone: 'info',
      },
      {
        company: 'Aether Systems',
        dateLabel: 'Jul 18',
        dateTime: '2026-07-18T18:00:00+00:00',
        id: '46ef9556-ec56-4281-b589-f985069b7c37',
        initial: 'A',
        role: 'Frontend Engineer',
        statusLabel: 'Interviewing',
        statusTone: 'attention',
      },
      {
        company: 'Meridian Studio',
        dateLabel: 'Jul 15',
        dateTime: '2026-07-15T18:00:00+00:00',
        id: '2a47fafc-c662-448b-8936-f61546d340de',
        initial: 'M',
        role: 'UI Engineer',
        statusLabel: 'Draft',
        statusTone: 'neutral',
      },
    ],
  },
  summary: {
    activeApplicationCount: 4,
    activeApplicationsLabel: '4 active applications',
    heading: 'Welcome back.',
    interviewCount: 1,
    interviewsLabel: '1 interview',
    message: 'You have one resume ready to review.',
  },
} as const satisfies DashboardViewModel

export const emptyDashboardViewModel = {
  attention: {
    action: {
      availability: 'unavailable',
      label: 'Upload base resume',
    },
    description:
      'A base resume gives future applications and tailoring a source document.',
    eyebrow: 'Next step',
    kind: 'guidance',
    title: 'Add a base resume',
  },
  baseResumes: {
    activeCount: 0,
    activeLimit: 3,
    countLabel: '0 of 3 resumes',
    emptyMessage: 'No base resumes have been added yet.',
    items: [],
    remainingSlots: 3,
    remainingSlotsLabel: '3 resume slots available',
  },
  quickActions: [
    {
      availability: 'unavailable',
      description: 'Start when you are ready',
      icon: 'create',
      id: 'create-application',
      label: 'Create application',
    },
    {
      availability: 'unavailable',
      description: '0 of 3 resumes',
      icon: 'upload',
      id: 'upload-base-resume',
      label: 'Upload base resume',
    },
    {
      availability: 'unavailable',
      description: 'No applications yet',
      icon: 'applications',
      id: 'view-applications',
      label: 'View applications',
    },
  ],
  recentApplications: {
    emptyMessage: 'No applications have been created yet.',
    items: [],
  },
  summary: {
    activeApplicationCount: 0,
    activeApplicationsLabel: '0 active applications',
    heading: 'Welcome back.',
    interviewCount: 0,
    interviewsLabel: '0 interviews',
    message: "Upload a base resume when you're ready.",
  },
} as const satisfies DashboardViewModel
