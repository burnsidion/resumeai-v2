import { z } from 'zod'

export const baseResumeRetirementIdSchema = z.uuid()

export const retiredBaseResumeSchema = z
  .object({
    id: baseResumeRetirementIdSchema,
    retiredAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const retireBaseResumeResponseSchema = z
  .object({
    baseResume: retiredBaseResumeSchema,
  })
  .strict()

export const baseResumeRetirementEndpointErrorCodeSchema = z.enum([
  'authentication-required',
  'authentication-unavailable',
  'base-resume-retirement-unavailable',
  'base-resume-unavailable',
  'invalid-base-resume-id',
])

export type BaseResumeRetirementEndpointErrorCode = z.infer<
  typeof baseResumeRetirementEndpointErrorCodeSchema
>
export type RetiredBaseResume = z.infer<typeof retiredBaseResumeSchema>
export type RetireBaseResumeResponse = z.infer<
  typeof retireBaseResumeResponseSchema
>
