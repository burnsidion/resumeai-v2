import { z } from 'zod'

import { applicationIdSchema } from './constraints'

export const deleteApplicationResponseSchema = z
  .object({
    application: z
      .object({
        id: applicationIdSchema,
      })
      .strict(),
  })
  .strict()

export type DeleteApplicationResponse = z.infer<
  typeof deleteApplicationResponseSchema
>
