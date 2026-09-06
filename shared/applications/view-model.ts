import { z } from 'zod'

import {
  applicationAppliedOnSchema,
  applicationCompanySchema,
  applicationIdSchema,
  applicationJobDescriptionSchema,
  applicationNotesSchema,
  applicationPostingUrlSchema,
  applicationRoleSchema,
  applicationStatusSchema,
} from './constraints'
import { applicationReadinessRequirementSchema } from './management'

const timestampSchema = z.iso.datetime({ offset: true })
const dateLabelSchema = z.string().trim().min(1)

export const applicationStatusToneSchema = z.enum([
  'attention',
  'danger',
  'info',
  'neutral',
  'success',
])

const applicationMissingRequirementViewModelSchema = z
  .object({
    id: applicationReadinessRequirementSchema,
    label: z.string().trim().min(1),
  })
  .strict()

export const applicationReadinessViewModelSchema = z.discriminatedUnion(
  'isReady',
  [
    z
      .object({
        isReady: z.literal(true),
        label: z.literal('Ready for tailoring'),
        missingRequirements: z.tuple([]),
      })
      .strict(),
    z
      .object({
        isReady: z.literal(false),
        label: z.literal('Not ready for tailoring'),
        missingRequirements: z
          .array(applicationMissingRequirementViewModelSchema)
          .min(1)
          .max(2),
      })
      .strict(),
  ],
)

const applicationStatusViewModelShape = {
  status: applicationStatusSchema,
  statusLabel: z.string().trim().min(1),
  statusTone: applicationStatusToneSchema,
} as const

export const applicationListItemViewModelSchema = z
  .object({
    company: applicationCompanySchema,
    id: applicationIdSchema,
    readiness: applicationReadinessViewModelSchema,
    role: applicationRoleSchema,
    ...applicationStatusViewModelShape,
    updatedAt: timestampSchema,
    updatedLabel: dateLabelSchema,
  })
  .strict()

export const applicationListViewModelSchema = z
  .object({
    applications: z.array(applicationListItemViewModelSchema),
  })
  .strict()

const availableSelectedBaseResumeViewModelSchema = z
  .object({
    availabilityLabel: z.literal('Active'),
    filename: z.string().trim().min(1),
    id: z.uuid(),
    isAvailable: z.literal(true),
  })
  .strict()

const unavailableSelectedBaseResumeViewModelSchema = z
  .object({
    availabilityLabel: z.literal('Unavailable'),
    filename: z.string().trim().min(1),
    id: z.uuid(),
    isAvailable: z.literal(false),
  })
  .strict()

export const applicationSelectedBaseResumeViewModelSchema =
  z.discriminatedUnion('isAvailable', [
    availableSelectedBaseResumeViewModelSchema,
    unavailableSelectedBaseResumeViewModelSchema,
  ])

export const applicationDetailViewModelSchema = z
  .object({
    appliedOn: applicationAppliedOnSchema.nullable(),
    company: applicationCompanySchema,
    createdAt: timestampSchema,
    createdLabel: dateLabelSchema,
    id: applicationIdSchema,
    jobDescription: applicationJobDescriptionSchema,
    notes: applicationNotesSchema,
    postingUrl: applicationPostingUrlSchema,
    readiness: applicationReadinessViewModelSchema,
    role: applicationRoleSchema,
    selectedBaseResume: applicationSelectedBaseResumeViewModelSchema.nullable(),
    ...applicationStatusViewModelShape,
    updatedAt: timestampSchema,
    updatedLabel: dateLabelSchema,
  })
  .strict()

export const applicationDetailResponseSchema = z
  .object({
    application: applicationDetailViewModelSchema,
  })
  .strict()

export type ApplicationDetailResponse = z.infer<
  typeof applicationDetailResponseSchema
>
export type ApplicationDetailViewModel = z.infer<
  typeof applicationDetailViewModelSchema
>
export type ApplicationListItemViewModel = z.infer<
  typeof applicationListItemViewModelSchema
>
export type ApplicationListViewModel = z.infer<
  typeof applicationListViewModelSchema
>
export type ApplicationReadinessViewModel = z.infer<
  typeof applicationReadinessViewModelSchema
>
export type ApplicationStatusTone = z.infer<typeof applicationStatusToneSchema>
