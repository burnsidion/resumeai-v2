export type DashboardApplicationStatusTone = 'attention' | 'info' | 'neutral'

export type DashboardQuickActionIcon = 'applications' | 'create' | 'upload'

export type DashboardResumeStatus = 'active' | 'primary'

export interface DashboardSummary {
  activeApplicationCount: number
  firstName: string
  interviewCount: number
  message: string
}

export interface DashboardReadyForReview {
  company: string
  description: string
  eyebrow: string
  primaryActionLabel: string
  role: string
  secondaryActionLabel: string
  status: string
}

export interface DashboardQuickAction {
  description: string
  icon: DashboardQuickActionIcon
  id: string
  label: string
}

export interface DashboardRecentApplication {
  company: string
  date: string
  dateTime: string
  id: string
  initial: string
  role: string
  status: string
  statusTone: DashboardApplicationStatusTone
}

export interface DashboardFollowUp {
  context: string
  label: string
}

export interface DashboardBaseResume {
  filename: string
  id: string
  status: DashboardResumeStatus
  updatedAt: string
}

export interface DashboardBaseResumes {
  activeCount: number
  activeLimit: number
  items: ReadonlyArray<DashboardBaseResume>
}

export interface DashboardViewModel {
  baseResumes: DashboardBaseResumes
  followUp?: DashboardFollowUp
  quickActions: ReadonlyArray<DashboardQuickAction>
  readyForReview: DashboardReadyForReview
  recentApplications: ReadonlyArray<DashboardRecentApplication>
  summary: DashboardSummary
}
