import { z } from 'zod'

import { baseResumeOriginalFilenameSchema } from './upload'

export const BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS = 5 * 60

export const baseResumePreviewIdSchema = z.uuid()

const baseResumePreviewUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol

  return protocol === 'http:' || protocol === 'https:'
}, 'The base-resume preview URL must use HTTP or HTTPS.')

export const baseResumePreviewSchema = z
  .object({
    baseResumeId: baseResumePreviewIdSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    originalFilename: baseResumeOriginalFilenameSchema,
    url: baseResumePreviewUrlSchema,
  })
  .strict()

export const baseResumePreviewResponseSchema = z
  .object({
    preview: baseResumePreviewSchema,
  })
  .strict()

export const baseResumePreviewEndpointErrorCodeSchema = z.enum([
  'authentication-required',
  'authentication-unavailable',
  'base-resume-preview-unavailable',
  'base-resume-unavailable',
  'invalid-base-resume-id',
])

export type BaseResumePreview = z.infer<typeof baseResumePreviewSchema>
export type BaseResumePreviewEndpointErrorCode = z.infer<
  typeof baseResumePreviewEndpointErrorCodeSchema
>
export type BaseResumePreviewResponse = z.infer<
  typeof baseResumePreviewResponseSchema
>
