import { z } from 'zod'

export const RESUME_INTERPRETER_NAME = 'unpdf'
export const RESUME_INTERPRETER_VERSION = '1.8.1'
export const RESUME_INTERPRETATION_SCHEMA_VERSION = 1
export const MAXIMUM_INTERPRETATION_PAGE_COUNT = 10
export const MAXIMUM_INTERPRETATION_IMAGE_PIXELS = 16_777_216

const sourceBlockTypes = [
  'bullet',
  'contact',
  'heading',
  'other',
  'paragraph',
  'position-metadata',
] as const

const sectionKinds = [
  'certifications',
  'education',
  'experience',
  'other',
  'projects',
  'skills',
  'summary',
] as const

const stableIdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]*$/u)

export const extractedPdfTextItemSchema = z
  .object({
    fontFamily: z.string(),
    fontSize: z.number().finite().nonnegative(),
    hasEOL: z.boolean(),
    height: z.number().finite().nonnegative(),
    page: z.number().int().positive(),
    text: z.string(),
    width: z.number().finite().nonnegative(),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict()

export const extractedPdfResumeSchema = z
  .object({
    items: z.array(extractedPdfTextItemSchema),
    pageCount: z.number().int().positive(),
  })
  .strict()

export const resumeSourceBlockSchema = z
  .object({
    id: stableIdentifierSchema,
    order: z.number().int().positive(),
    page: z.number().int().positive(),
    text: z.string().trim().min(1),
    type: z.enum(sourceBlockTypes),
  })
  .strict()

export const resumeSectionItemSchema = z
  .object({
    evidenceRefs: z.array(stableIdentifierSchema).min(1),
    id: stableIdentifierSchema,
    text: z.string().trim().min(1),
  })
  .strict()

export const resumeLogicalSectionSchema = z
  .object({
    heading: z.string().trim().min(1),
    id: stableIdentifierSchema,
    items: z.array(resumeSectionItemSchema).min(1),
    kind: z.enum(sectionKinds),
  })
  .strict()

export const resumeInterpretationStructuredContentSchema = z
  .object({
    sections: z.array(resumeLogicalSectionSchema).min(1),
    sourceBlocks: z.array(resumeSourceBlockSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const sourceBlockIds = new Set<string>()

    for (const sourceBlock of value.sourceBlocks) {
      if (sourceBlockIds.has(sourceBlock.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Source block IDs must be unique.',
          path: ['sourceBlocks'],
        })
      }

      sourceBlockIds.add(sourceBlock.id)
    }

    const sectionIds = new Set<string>()
    const itemIds = new Set<string>()

    for (const [sectionIndex, section] of value.sections.entries()) {
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Logical section IDs must be unique.',
          path: ['sections', sectionIndex],
        })
      }

      sectionIds.add(section.id)

      for (const [itemIndex, item] of section.items.entries()) {
        if (itemIds.has(item.id)) {
          context.addIssue({
            code: 'custom',
            message: 'Logical section item IDs must be unique.',
            path: ['sections', sectionIndex, 'items', itemIndex],
          })
        }

        itemIds.add(item.id)

        for (const evidenceRef of item.evidenceRefs) {
          if (!sourceBlockIds.has(evidenceRef)) {
            context.addIssue({
              code: 'custom',
              message:
                'Every logical section item must reference a source block.',
              path: [
                'sections',
                sectionIndex,
                'items',
                itemIndex,
                'evidenceRefs',
              ],
            })
          }
        }
      }
    }
  })

export type ExtractedPdfResume = z.infer<typeof extractedPdfResumeSchema>
export type ResumeInterpretationStructuredContent = z.infer<
  typeof resumeInterpretationStructuredContentSchema
>
export type ResumeSectionKind = (typeof sectionKinds)[number]
export type ResumeSourceBlockType = (typeof sourceBlockTypes)[number]
