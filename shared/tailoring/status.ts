import { z } from 'zod'

const timestampSchema = z.iso.datetime({ offset: true })

export const tailoringWorkingCopyStateSchema = z.enum([
  'accepted',
  'awaiting_review',
])

export const tailoringWorkingCopySummarySchema = z
  .object({
    id: z.uuid(),
    revisionNumber: z.number().int().positive(),
    state: tailoringWorkingCopyStateSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const applicationTailoringStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-ready') }).strict(),
  z.object({ state: z.literal('ready') }).strict(),
  z.object({ state: z.literal('processing') }).strict(),
  z
    .object({
      state: z.literal('working-copy-ready'),
      workingCopy: tailoringWorkingCopySummarySchema.extend({
        state: z.literal('awaiting_review'),
      }),
    })
    .strict(),
  z
    .object({
      state: z.literal('working-copy-accepted'),
      workingCopy: tailoringWorkingCopySummarySchema.extend({
        state: z.literal('accepted'),
      }),
    })
    .strict(),
])

export type ApplicationTailoringState = z.infer<
  typeof applicationTailoringStateSchema
>
export type TailoringWorkingCopyState = z.infer<
  typeof tailoringWorkingCopyStateSchema
>
export type TailoringWorkingCopySummary = z.infer<
  typeof tailoringWorkingCopySummarySchema
>
