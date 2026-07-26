import type { DashboardViewModel } from '~/types/dashboard'

export const dashboardMockData = {
  summary: {
    activeApplicationCount: 4,
    firstName: 'Ian',
    interviewCount: 1,
    message: 'You have one resume ready to review.',
  },
  readyForReview: {
    company: 'Northstar Labs',
    description: 'Review your tailored resume before you finalize it.',
    eyebrow: 'Ready for review',
    primaryActionLabel: 'Review working copy',
    role: 'Senior Frontend Engineer',
    secondaryActionLabel: 'Open application',
    status: 'Working copy ready',
  },
  quickActions: [
    {
      description: 'Start when you are ready',
      icon: 'create',
      id: 'create-application',
      label: 'Create application',
    },
    {
      description: '2 of 3 resumes',
      icon: 'upload',
      id: 'upload-base-resume',
      label: 'Upload base resume',
    },
    {
      description: 'Return to recent work',
      icon: 'applications',
      id: 'view-applications',
      label: 'View applications',
    },
  ],
  recentApplications: [
    {
      company: 'Lantern Health',
      date: 'Jul 22',
      dateTime: '2026-07-22',
      id: 'lantern-health-product-engineer',
      initial: 'L',
      role: 'Product Engineer',
      status: 'Applied',
      statusTone: 'info',
    },
    {
      company: 'Aether Systems',
      date: 'Jul 18',
      dateTime: '2026-07-18',
      id: 'aether-systems-frontend-engineer',
      initial: 'A',
      role: 'Frontend Engineer',
      status: 'Interview',
      statusTone: 'attention',
    },
    {
      company: 'Meridian Studio',
      date: 'Jul 15',
      dateTime: '2026-07-15',
      id: 'meridian-studio-ui-engineer',
      initial: 'M',
      role: 'UI Engineer',
      status: 'Draft',
      statusTone: 'neutral',
    },
  ],
  followUp: {
    context: 'Product Engineer at Lantern Health',
    label: 'Follow-up due today',
  },
  baseResumes: {
    activeCount: 2,
    activeLimit: 3,
    items: [
      {
        filename: 'Frontend Engineering.pdf',
        id: 'frontend-engineering',
        status: 'primary',
        updatedAt: 'Updated Jul 20',
      },
      {
        filename: 'Accessibility Specialist.pdf',
        id: 'accessibility-specialist',
        status: 'active',
        updatedAt: 'Updated Jul 14',
      },
    ],
  },
} as const satisfies DashboardViewModel
