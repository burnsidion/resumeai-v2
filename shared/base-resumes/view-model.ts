import { z } from 'zod'

import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
} from './upload'

const countSchema = z.number().int().nonnegative().max(3)
const timestampSchema = z.iso.datetime({ offset: true })

export const baseResumeManagementItemViewModelSchema = z
  .object({
    activeSlot: activeBaseResumeSlotSchema,
    createdAt: timestampSchema,
    fileSizeLabel: z.string().trim().min(1),
    filename: baseResumeOriginalFilenameSchema,
    id: z.uuid(),
    sizeBytes: z.number().int().positive(),
    slotLabel: z.string().trim().min(1),
    statusLabel: z.literal('Active'),
    uploadedLabel: z.string().trim().min(1),
  })
  .strict()

export const baseResumesManagementViewModelSchema = z
  .object({
    activeCount: countSchema,
    activeCountLabel: z.string().trim().min(1),
    activeLimit: z.literal(3),
    capacityAriaLabel: z.string().trim().min(1),
    capacityLabel: z.string().trim().min(1),
    capacityStatusLabel: z.string().trim().min(1),
    items: z.array(baseResumeManagementItemViewModelSchema).max(3),
    remainingSlots: countSchema,
  })
  .strict()
  .superRefine(
    ({ activeCount, activeLimit, items, remainingSlots }, context) => {
      if (activeCount !== items.length) {
        context.addIssue({
          code: 'custom',
          message: 'Active resume count must match the rendered items.',
          path: ['activeCount'],
        })
      }

      if (remainingSlots !== activeLimit - activeCount) {
        context.addIssue({
          code: 'custom',
          message: 'Remaining slots must match the active resume capacity.',
          path: ['remainingSlots'],
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
    },
  )

export type BaseResumeManagementItemViewModel = z.infer<
  typeof baseResumeManagementItemViewModelSchema
>
export type BaseResumesManagementViewModel = z.infer<
  typeof baseResumesManagementViewModelSchema
>
