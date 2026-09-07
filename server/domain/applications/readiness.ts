import {
  applicationReadinessSchema,
  type ApplicationReadiness,
  type ApplicationReadinessRequirement,
} from '../../../shared/applications/management'

export interface ApplicationReadinessInput {
  jobDescription: string | null
  selectedBaseResumeAvailable: boolean
}

export function deriveApplicationReadiness({
  jobDescription,
  selectedBaseResumeAvailable,
}: ApplicationReadinessInput): ApplicationReadiness {
  const missingRequirements: ApplicationReadinessRequirement[] = []

  if (!jobDescription?.trim()) {
    missingRequirements.push('job-description')
  }

  if (!selectedBaseResumeAvailable) {
    missingRequirements.push('base-resume')
  }

  return applicationReadinessSchema.parse(
    missingRequirements.length === 0
      ? { isReady: true, missingRequirements: [] }
      : { isReady: false, missingRequirements },
  )
}
