import { z } from 'zod'

import { baseResumeOriginalFilenameSchema } from '../base-resumes/upload'

const timestampSchema = z.iso.datetime({ offset: true })

export const tailoringReviewDocumentSectionSchema = z
  .object({
    heading: z.string().trim().min(1),
    items: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()

export const tailoringReviewChangeKindSchema = z.enum([
  'omitted',
  'reordered',
  'rewritten',
])

export const tailoringReviewChangeGroupSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            explanation: z.string().trim().min(1),
            kind: tailoringReviewChangeKindSchema,
          })
          .strict(),
      )
      .min(1),
    sectionHeading: z.string().trim().min(1),
  })
  .strict()

export const applicationWorkingCopyReviewSchema = z
  .object({
    changes: z.array(tailoringReviewChangeGroupSchema),
    proposal: z
      .object({
        sections: z.array(tailoringReviewDocumentSectionSchema).min(1),
      })
      .strict(),
    source: z
      .object({
        baseResumeId: z.uuid(),
        filename: baseResumeOriginalFilenameSchema,
        sections: z.array(tailoringReviewDocumentSectionSchema).min(1),
      })
      .strict(),
    workingCopy: z
      .object({
        id: z.uuid(),
        revisionNumber: z.number().int().positive(),
        state: z.enum(['accepted', 'awaiting_review']),
        updatedAt: timestampSchema,
      })
      .strict(),
  })
  .strict()

export const applicationWorkingCopyReviewResponseSchema = z
  .object({
    review: applicationWorkingCopyReviewSchema,
  })
  .strict()

export const workingCopyLifecycleResponseSchema = z
  .object({
    workingCopy: z
      .object({
        id: z.uuid(),
        revisionNumber: z.number().int().positive(),
        state: z.enum(['accepted', 'awaiting_review']),
        updatedAt: timestampSchema,
      })
      .strict(),
  })
  .strict()

export const discardWorkingCopyResponseSchema = z
  .object({
    discardedWorkingCopyId: z.uuid(),
  })
  .strict()

export const tailoringReviewEndpointErrorCodeSchema = z.enum([
  'application-unavailable',
  'authentication-required',
  'authentication-unavailable',
  'invalid-application-id',
  'invalid-revision-request',
  'tailoring-in-progress',
  'tailoring-unavailable',
  'working-copy-already-exists',
  'working-copy-immutable',
  'working-copy-lifecycle-unavailable',
  'working-copy-review-unavailable',
  'working-copy-unavailable',
])

export type ApplicationWorkingCopyReview = z.infer<
  typeof applicationWorkingCopyReviewSchema
>
export type ApplicationWorkingCopyReviewResponse = z.infer<
  typeof applicationWorkingCopyReviewResponseSchema
>
export type WorkingCopyLifecycleResponse = z.infer<
  typeof workingCopyLifecycleResponseSchema
>
export type DiscardWorkingCopyResponse = z.infer<
  typeof discardWorkingCopyResponseSchema
>
export type TailoringReviewEndpointErrorCode = z.infer<
  typeof tailoringReviewEndpointErrorCodeSchema
>
