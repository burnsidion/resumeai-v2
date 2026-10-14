import { z } from 'zod'

export const generateApplicationWorkingCopyResponseSchema = z
  .object({
    workingCopy: z
      .object({
        id: z.uuid(),
        revisionNumber: z.number().int().positive(),
        updatedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict()

export const tailoringGenerationEndpointErrorCodeSchema = z.enum([
  'application-not-ready',
  'application-unavailable',
  'authentication-required',
  'authentication-unavailable',
  'invalid-application-id',
  'tailoring-in-progress',
  'tailoring-unavailable',
  'working-copy-immutable',
])

export type GenerateApplicationWorkingCopyResponse = z.infer<
  typeof generateApplicationWorkingCopyResponseSchema
>
export type TailoringGenerationEndpointErrorCode = z.infer<
  typeof tailoringGenerationEndpointErrorCodeSchema
>
