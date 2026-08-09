import { z } from 'zod'

import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
} from '../base-resumes/upload'

const activeBaseResumeCountSchema = z.number().int().nonnegative().max(3)
const timestampSchema = z.iso.datetime({ offset: true })

export const activeBaseResumeManagementItemSchema = z
  .object({
    activeSlot: activeBaseResumeSlotSchema,
    createdAt: timestampSchema,
    id: z.uuid(),
    originalFilename: baseResumeOriginalFilenameSchema,
    sizeBytes: z.number().int().positive(),
  })
  .strict()

export const baseResumesManagementDataSchema = z
  .object({
    activeCount: activeBaseResumeCountSchema,
    activeLimit: z.literal(3),
    items: z.array(activeBaseResumeManagementItemSchema).max(3),
  })
  .strict()
  .superRefine(({ activeCount, items }, context) => {
    if (activeCount !== items.length) {
      context.addIssue({
        code: 'custom',
        message: 'Active resume count must match the returned active resumes.',
        path: ['activeCount'],
      })
    }

    const hasInvalidSlotOrder = items.some(
      (item, index) =>
        index > 0 && item.activeSlot <= items[index - 1]!.activeSlot,
    )

    if (hasInvalidSlotOrder) {
      context.addIssue({
        code: 'custom',
        message: 'Active resumes must be uniquely ordered by active slot.',
        path: ['items'],
      })
    }
  })

export type ActiveBaseResumeManagementItem = z.infer<
  typeof activeBaseResumeManagementItemSchema
>
export type BaseResumesManagementData = z.infer<
  typeof baseResumesManagementDataSchema
>
