import { z } from 'zod'

import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
} from '../base-resumes/upload'
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

const timestampSchema = z.iso.datetime({ offset: true })
const readinessRequirementOrder = ['job-description', 'base-resume'] as const

export const applicationReadinessRequirementSchema = z.enum([
  'job-description',
  'base-resume',
])

export const applicationReadinessSchema = z.discriminatedUnion('isReady', [
  z
    .object({
      isReady: z.literal(true),
      missingRequirements: z.tuple([]),
    })
    .strict(),
  z
    .object({
      isReady: z.literal(false),
      missingRequirements: z
        .array(applicationReadinessRequirementSchema)
        .min(1)
        .max(2)
        .refine(
          (requirements) =>
            new Set(requirements).size === requirements.length &&
            requirements.every((requirement, index) => {
              const previousRequirement = requirements[index - 1]

              return (
                previousRequirement === undefined ||
                readinessRequirementOrder.indexOf(previousRequirement) <
                  readinessRequirementOrder.indexOf(requirement)
              )
            }),
          'Missing application requirements must use deterministic order.',
        ),
    })
    .strict(),
])

export const createApplicationRequestSchema = z
  .object({
    company: applicationCompanySchema,
    jobDescription: applicationJobDescriptionSchema.optional().default(null),
    notes: applicationNotesSchema.optional().default(null),
    postingUrl: applicationPostingUrlSchema.optional().default(null),
    role: applicationRoleSchema,
    selectedBaseResumeId: applicationIdSchema
      .nullable()
      .optional()
      .default(null),
  })
  .strict()

export const updateApplicationRequestSchema = z
  .object({
    appliedOn: applicationAppliedOnSchema.nullable().optional(),
    company: applicationCompanySchema.optional(),
    jobDescription: applicationJobDescriptionSchema.optional(),
    notes: applicationNotesSchema.optional(),
    postingUrl: applicationPostingUrlSchema.optional(),
    role: applicationRoleSchema.optional(),
    selectedBaseResumeId: applicationIdSchema.nullable().optional(),
    status: applicationStatusSchema.optional(),
  })
  .strict()
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: 'At least one application field is required.',
    },
  )

export const applicationSelectedBaseResumeDataSchema = z
  .object({
    activeSlot: activeBaseResumeSlotSchema.nullable(),
    id: z.uuid(),
    isAvailable: z.boolean(),
    originalFilename: baseResumeOriginalFilenameSchema,
    retiredAt: timestampSchema.nullable(),
  })
  .strict()
  .refine(
    ({ activeSlot, isAvailable, retiredAt }) =>
      isAvailable === (activeSlot !== null && retiredAt === null),
    {
      message:
        'Base resume availability must match its active lifecycle state.',
      path: ['isAvailable'],
    },
  )

export const applicationManagementDataSchema = z
  .object({
    appliedOn: applicationAppliedOnSchema.nullable(),
    company: applicationCompanySchema,
    createdAt: timestampSchema,
    id: applicationIdSchema,
    jobDescription: applicationJobDescriptionSchema,
    notes: applicationNotesSchema,
    postingUrl: applicationPostingUrlSchema,
    readiness: applicationReadinessSchema,
    role: applicationRoleSchema,
    selectedBaseResume: applicationSelectedBaseResumeDataSchema.nullable(),
    status: applicationStatusSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .refine(
    ({ createdAt, updatedAt }) =>
      new Date(updatedAt).getTime() >= new Date(createdAt).getTime(),
    {
      message: 'Application update time cannot precede its creation time.',
      path: ['updatedAt'],
    },
  )

export type ApplicationManagementData = z.infer<
  typeof applicationManagementDataSchema
>
export type ApplicationReadiness = z.infer<typeof applicationReadinessSchema>
export type ApplicationReadinessRequirement = z.infer<
  typeof applicationReadinessRequirementSchema
>
export type CreateApplicationRequest = z.infer<
  typeof createApplicationRequestSchema
>
export type UpdateApplicationRequest = z.infer<
  typeof updateApplicationRequestSchema
>
