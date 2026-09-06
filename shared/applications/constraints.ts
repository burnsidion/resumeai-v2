import { z } from 'zod'

export const MAXIMUM_APPLICATION_COMPANY_LENGTH = 200
export const MAXIMUM_APPLICATION_ROLE_LENGTH = 200
export const MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH = 50_000
export const MAXIMUM_APPLICATION_POSTING_URL_LENGTH = 2_048
export const MAXIMUM_APPLICATION_NOTES_LENGTH = 10_000

export const APPLICATION_STATUSES = [
  'draft',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES)
export const applicationIdSchema = z.uuid()
export const applicationAppliedOnSchema = z.iso.date()

export const applicationCompanySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAXIMUM_APPLICATION_COMPANY_LENGTH)

export const applicationRoleSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAXIMUM_APPLICATION_ROLE_LENGTH)

const createNullableTrimmedTextSchema = (maximumLength: number) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => {
      if (value === null) {
        return null
      }

      const normalized = value.trim()

      return normalized.length === 0 ? null : normalized
    })
    .pipe(z.string().max(maximumLength).nullable())

export const applicationJobDescriptionSchema = createNullableTrimmedTextSchema(
  MAXIMUM_APPLICATION_JOB_DESCRIPTION_LENGTH,
)

export const applicationNotesSchema = createNullableTrimmedTextSchema(
  MAXIMUM_APPLICATION_NOTES_LENGTH,
)

export const applicationPostingUrlSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) {
      return null
    }

    const normalized = value.trim()

    return normalized.length === 0 ? null : normalized
  })
  .pipe(
    z
      .url()
      .max(MAXIMUM_APPLICATION_POSTING_URL_LENGTH)
      .refine((value) => {
        try {
          const protocol = new URL(value).protocol

          return protocol === 'http:' || protocol === 'https:'
        } catch {
          return false
        }
      }, 'The posting URL must use HTTP or HTTPS.')
      .nullable(),
  )

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>
