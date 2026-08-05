import { z } from 'zod'

export const MAXIMUM_BASE_RESUME_FILENAME_LENGTH = 255

const hasUnsafeFilenameCharacter = (filename: string): boolean =>
  Array.from(filename).some((character) => {
    const codePoint = character.codePointAt(0)

    return (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      character === '/' ||
      character === '\\'
    )
  })

export const activeBaseResumeSlotSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
])

export const baseResumeOriginalFilenameSchema = z
  .string()
  .min(1)
  .refine(
    (filename) =>
      filename === filename.trim() &&
      Array.from(filename).length <= MAXIMUM_BASE_RESUME_FILENAME_LENGTH &&
      !hasUnsafeFilenameCharacter(filename),
    'The base-resume filename is not supported.',
  )

export const uploadedBaseResumeSchema = z
  .object({
    activeSlot: activeBaseResumeSlotSchema,
    createdAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
    originalFilename: baseResumeOriginalFilenameSchema,
  })
  .strict()

export const uploadBaseResumeResponseSchema = z
  .object({
    baseResume: uploadedBaseResumeSchema,
  })
  .strict()

export const baseResumeUploadEndpointErrorCodeSchema = z.enum([
  'active-resume-limit-reached',
  'authentication-required',
  'authentication-unavailable',
  'base-resume-upload-unavailable',
  'file-too-large',
  'invalid-filename',
  'invalid-pdf',
  'invalid-upload',
  'unsupported-file-type',
])

export type ActiveBaseResumeSlot = z.infer<typeof activeBaseResumeSlotSchema>
export type BaseResumeUploadEndpointErrorCode = z.infer<
  typeof baseResumeUploadEndpointErrorCodeSchema
>
export type UploadedBaseResume = z.infer<typeof uploadedBaseResumeSchema>
export type UploadBaseResumeResponse = z.infer<
  typeof uploadBaseResumeResponseSchema
>
