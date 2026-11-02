import { z } from 'zod'

export const MAXIMUM_TAILORING_REVISION_GUIDANCE_LENGTH = 1_000

export const requestWorkingCopyRevisionSchema = z
  .object({
    guidance: z
      .string()
      .trim()
      .max(MAXIMUM_TAILORING_REVISION_GUIDANCE_LENGTH)
      .optional(),
  })
  .strict()
  .transform((input) => ({
    guidance:
      input.guidance && input.guidance.length > 0 ? input.guidance : undefined,
  }))

export type RequestWorkingCopyRevision = z.infer<
  typeof requestWorkingCopyRevisionSchema
>
