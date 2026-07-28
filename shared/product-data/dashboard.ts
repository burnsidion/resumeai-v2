import { z } from 'zod'

export const applicationStatusSchema = z.enum([
  'draft',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
])

const countSchema = z.number().int().nonnegative()
const timestampSchema = z.iso.datetime({ offset: true })

export const dashboardApplicationSummarySchema = z
  .object({
    activeCount: countSchema,
    interviewCount: countSchema,
  })
  .strict()
  .refine(({ activeCount, interviewCount }) => interviewCount <= activeCount, {
    message: 'Interview count cannot exceed active application count.',
    path: ['interviewCount'],
  })

export const dashboardRecentApplicationSchema = z
  .object({
    appliedOn: z.iso.date().nullable(),
    company: z.string().trim().min(1),
    createdAt: timestampSchema,
    id: z.uuid(),
    role: z.string().trim().min(1),
    status: applicationStatusSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const dashboardBaseResumePreviewSchema = z
  .object({
    activeSlot: z.number().int().min(1).max(3),
    createdAt: timestampSchema,
    id: z.uuid(),
    originalFilename: z.string().trim().min(1),
  })
  .strict()

export const dashboardBaseResumesSchema = z
  .object({
    activeCount: countSchema.max(3),
    activeLimit: z.literal(3),
    items: z.array(dashboardBaseResumePreviewSchema).max(3),
  })
  .strict()
  .refine(({ activeCount, items }) => activeCount === items.length, {
    message: 'Active resume count must match the returned active resumes.',
    path: ['activeCount'],
  })

export const dashboardReadyForReviewSchema = z
  .object({
    applicationId: z.uuid(),
    company: z.string().trim().min(1),
    role: z.string().trim().min(1),
    state: z.literal('awaiting_review'),
    updatedAt: timestampSchema,
    workingCopyId: z.uuid(),
  })
  .strict()

export const dashboardProductDataSchema = z
  .object({
    applicationSummary: dashboardApplicationSummarySchema,
    baseResumes: dashboardBaseResumesSchema,
    readyForReview: dashboardReadyForReviewSchema.nullable(),
    recentApplications: z.array(dashboardRecentApplicationSchema).max(3),
  })
  .strict()

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>
export type DashboardApplicationSummary = z.infer<
  typeof dashboardApplicationSummarySchema
>
export type DashboardBaseResumePreview = z.infer<
  typeof dashboardBaseResumePreviewSchema
>
export type DashboardBaseResumes = z.infer<typeof dashboardBaseResumesSchema>
export type DashboardProductData = z.infer<typeof dashboardProductDataSchema>
export type DashboardReadyForReview = z.infer<
  typeof dashboardReadyForReviewSchema
>
export type DashboardRecentApplication = z.infer<
  typeof dashboardRecentApplicationSchema
>
