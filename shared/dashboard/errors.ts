import { z } from 'zod'

export const dashboardEndpointErrorCodeSchema = z.enum([
  'authentication-required',
  'authentication-unavailable',
  'dashboard-unavailable',
])

export type DashboardEndpointErrorCode = z.infer<
  typeof dashboardEndpointErrorCodeSchema
>
