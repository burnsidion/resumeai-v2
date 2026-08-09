import { z } from 'zod'

export const baseResumesReadEndpointErrorCodeSchema = z.enum([
  'authentication-required',
  'authentication-unavailable',
  'base-resumes-unavailable',
])

export type BaseResumesReadEndpointErrorCode = z.infer<
  typeof baseResumesReadEndpointErrorCodeSchema
>
