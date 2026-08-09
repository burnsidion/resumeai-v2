import { z } from 'zod'

import { activeBaseResumeSlotSchema } from '../base-resumes/upload'

const countSchema = z.number().int().nonnegative()
const timestampSchema = z.iso.datetime({ offset: true })

export const dashboardUnavailableActionSchema = z
  .object({
    availability: z.literal('unavailable'),
    label: z.string().trim().min(1),
  })
  .strict()

export const dashboardActionAvailabilitySchema = z.enum([
  'available',
  'unavailable',
])

export const dashboardGuidanceActionIdSchema = z.enum([
  'create-application',
  'upload-base-resume',
])

export const dashboardGuidanceActionSchema = z
  .object({
    availability: dashboardActionAvailabilitySchema,
    id: dashboardGuidanceActionIdSchema,
    label: z.string().trim().min(1),
  })
  .strict()

export const dashboardSummaryViewModelSchema = z
  .object({
    activeApplicationCount: countSchema,
    activeApplicationsLabel: z.string().trim().min(1),
    heading: z.string().trim().min(1),
    interviewCount: countSchema,
    interviewsLabel: z.string().trim().min(1),
    message: z.string().trim().min(1),
  })
  .strict()

const dashboardReviewAttentionSchema = z
  .object({
    applicationId: z.uuid(),
    company: z.string().trim().min(1),
    description: z.string().trim().min(1),
    eyebrow: z.string().trim().min(1),
    kind: z.literal('ready-for-review'),
    primaryAction: dashboardUnavailableActionSchema,
    role: z.string().trim().min(1),
    secondaryAction: dashboardUnavailableActionSchema,
    status: z.string().trim().min(1),
    workingCopyId: z.uuid(),
  })
  .strict()

const dashboardGuidanceAttentionSchema = z
  .object({
    action: dashboardGuidanceActionSchema.nullable(),
    description: z.string().trim().min(1),
    eyebrow: z.string().trim().min(1),
    kind: z.literal('guidance'),
    title: z.string().trim().min(1),
  })
  .strict()

export const dashboardAttentionViewModelSchema = z.discriminatedUnion('kind', [
  dashboardReviewAttentionSchema,
  dashboardGuidanceAttentionSchema,
])

export const dashboardQuickActionIconSchema = z.enum([
  'applications',
  'create',
  'upload',
])

export const dashboardQuickActionIdSchema = z.enum([
  'create-application',
  'upload-base-resume',
  'view-applications',
])

export const dashboardQuickActionViewModelSchema = z
  .object({
    availability: dashboardActionAvailabilitySchema,
    description: z.string().trim().min(1),
    icon: dashboardQuickActionIconSchema,
    id: dashboardQuickActionIdSchema,
    label: z.string().trim().min(1),
  })
  .strict()

export const dashboardApplicationStatusToneSchema = z.enum([
  'attention',
  'danger',
  'info',
  'neutral',
  'success',
])

export const dashboardRecentApplicationViewModelSchema = z
  .object({
    company: z.string().trim().min(1),
    dateLabel: z.string().trim().min(1),
    dateTime: timestampSchema,
    id: z.uuid(),
    initial: z.string().trim().min(1),
    role: z.string().trim().min(1),
    statusLabel: z.string().trim().min(1),
    statusTone: dashboardApplicationStatusToneSchema,
  })
  .strict()

export const dashboardRecentApplicationsViewModelSchema = z
  .object({
    emptyMessage: z.string().trim().min(1).nullable(),
    items: z.array(dashboardRecentApplicationViewModelSchema).max(3),
  })
  .strict()
  .refine(
    ({ emptyMessage, items }) =>
      items.length === 0 ? emptyMessage !== null : emptyMessage === null,
    {
      message:
        'Recent applications must provide empty copy only when no items exist.',
      path: ['emptyMessage'],
    },
  )

export const dashboardBaseResumeViewModelSchema = z
  .object({
    activeSlot: activeBaseResumeSlotSchema,
    addedLabel: z.string().trim().min(1),
    createdAt: timestampSchema,
    filename: z.string().trim().min(1),
    id: z.uuid(),
    statusLabel: z.literal('Active'),
  })
  .strict()

export const dashboardBaseResumesViewModelSchema = z
  .object({
    activeCount: countSchema.max(3),
    activeLimit: z.literal(3),
    countLabel: z.string().trim().min(1),
    emptyMessage: z.string().trim().min(1).nullable(),
    items: z.array(dashboardBaseResumeViewModelSchema).max(3),
    remainingSlots: countSchema.max(3),
    remainingSlotsLabel: z.string().trim().min(1).nullable(),
  })
  .strict()
  .superRefine(
    (
      {
        activeCount,
        activeLimit,
        emptyMessage,
        items,
        remainingSlots,
        remainingSlotsLabel,
      },
      context,
    ) => {
      if (activeCount !== items.length) {
        context.addIssue({
          code: 'custom',
          message: 'Active resume count must match the rendered items.',
          path: ['activeCount'],
        })
      }

      if (remainingSlots !== activeLimit - activeCount) {
        context.addIssue({
          code: 'custom',
          message: 'Remaining slots must match the active resume capacity.',
          path: ['remainingSlots'],
        })
      }

      if (
        (items.length === 0 && emptyMessage === null) ||
        (items.length > 0 && emptyMessage !== null)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Base resumes must provide empty copy only when empty.',
          path: ['emptyMessage'],
        })
      }

      if (
        (remainingSlots === 0 && remainingSlotsLabel !== null) ||
        (remainingSlots > 0 && remainingSlotsLabel === null)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Resume capacity copy must be present only when slots remain.',
          path: ['remainingSlotsLabel'],
        })
      }
    },
  )

export const dashboardViewModelSchema = z
  .object({
    attention: dashboardAttentionViewModelSchema,
    baseResumes: dashboardBaseResumesViewModelSchema,
    quickActions: z.array(dashboardQuickActionViewModelSchema).length(3),
    recentApplications: dashboardRecentApplicationsViewModelSchema,
    summary: dashboardSummaryViewModelSchema,
  })
  .strict()

export type DashboardApplicationStatusTone = z.infer<
  typeof dashboardApplicationStatusToneSchema
>
export type DashboardAttentionViewModel = z.infer<
  typeof dashboardAttentionViewModelSchema
>
export type DashboardBaseResumeViewModel = z.infer<
  typeof dashboardBaseResumeViewModelSchema
>
export type DashboardBaseResumesViewModel = z.infer<
  typeof dashboardBaseResumesViewModelSchema
>
export type DashboardQuickActionViewModel = z.infer<
  typeof dashboardQuickActionViewModelSchema
>
export type DashboardQuickActionId = z.infer<
  typeof dashboardQuickActionIdSchema
>
export type DashboardRecentApplicationViewModel = z.infer<
  typeof dashboardRecentApplicationViewModelSchema
>
export type DashboardRecentApplicationsViewModel = z.infer<
  typeof dashboardRecentApplicationsViewModelSchema
>
export type DashboardSummaryViewModel = z.infer<
  typeof dashboardSummaryViewModelSchema
>
export type DashboardViewModel = z.infer<typeof dashboardViewModelSchema>
