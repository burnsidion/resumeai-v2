import { z } from 'zod'

export const applicationManagementEndpointErrorCodeSchema = z.enum([
  'application-save-unavailable',
  'application-unavailable',
  'applications-unavailable',
  'authentication-required',
  'authentication-unavailable',
  'invalid-application',
  'invalid-application-id',
  'selected-base-resume-unavailable',
])

export type ApplicationManagementEndpointErrorCode = z.infer<
  typeof applicationManagementEndpointErrorCodeSchema
>
