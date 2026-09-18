import {
  MAXIMUM_INTERPRETATION_PAGE_COUNT,
  type ExtractedPdfResume,
  extractedPdfResumeSchema,
  type ResumeInterpretationStructuredContent,
  type ResumeSectionKind,
  type ResumeSourceBlockType,
  resumeInterpretationStructuredContentSchema,
} from './contracts'

export type ResumeInterpretationDomainErrorCode =
  'empty-document' | 'page-limit-exceeded'

export class ResumeInterpretationDomainError extends Error {
  constructor(readonly code: ResumeInterpretationDomainErrorCode) {
    super(`Resume interpretation failed: ${code}.`)
    this.name = 'ResumeInterpretationDomainError'
  }
}

interface LogicalSectionDraft {
  heading: string
  id: string
  items: Array<{
    evidenceRefs: [string]
    id: string
    text: string
  }>
  kind: ResumeSectionKind
}

const sectionHeadingKinds: Readonly<Record<string, ResumeSectionKind>> = {
  'academic background': 'education',
  certifications: 'certifications',
  education: 'education',
  experience: 'experience',
  'professional experience': 'experience',
  profile: 'summary',
  projects: 'projects',
  'professional summary': 'summary',
  qualifications: 'skills',
  'relevant experience': 'experience',
  skills: 'skills',
  summary: 'summary',
  'technical skills': 'skills',
  'work experience': 'experience',
}

const normalizeHeading = (text: string): string =>
  text.trim().toLocaleLowerCase().replace(/\s+/gu, ' ')

const isContactText = (text: string): boolean =>
  /@|\b(?:linkedin\.com|github\.com|https?:\/\/|www\.)\b|\+?\d[\d().\s-]{6,}\d/u.test(
    text,
  )

const isBulletText = (text: string): boolean =>
  /^[•◦▪▫‣*-]\s+/u.test(text.trim())

const toSourceBlockType = (text: string): ResumeSourceBlockType => {
  if (sectionHeadingKinds[normalizeHeading(text)] !== undefined) {
    return 'heading'
  }

  if (isContactText(text)) {
    return 'contact'
  }

  if (isBulletText(text)) {
    return 'bullet'
  }

  return 'paragraph'
}

const toStableIdentifier = (prefix: string, order: number): string =>
  `${prefix}-${String(order).padStart(3, '0')}`

const comparePdfTextItems = (
  left: ExtractedPdfResume['items'][number],
  right: ExtractedPdfResume['items'][number],
): number =>
  left.page - right.page ||
  right.y - left.y ||
  left.x - right.x ||
  left.text.localeCompare(right.text)

const createOtherSection = (): LogicalSectionDraft => ({
  heading: 'Other',
  id: 'section-other',
  items: [],
  kind: 'other',
})

const createSection = (
  heading: string,
  kind: ResumeSectionKind,
  order: number,
): LogicalSectionDraft => ({
  heading,
  id: toStableIdentifier('section', order),
  items: [],
  kind,
})

export function createResumeInterpretationStructuredContent(
  extraction: ExtractedPdfResume,
): ResumeInterpretationStructuredContent {
  const parsedExtraction = extractedPdfResumeSchema.parse(extraction)

  if (parsedExtraction.pageCount > MAXIMUM_INTERPRETATION_PAGE_COUNT) {
    throw new ResumeInterpretationDomainError('page-limit-exceeded')
  }

  const sourceBlocks = parsedExtraction.items
    .map((item) => ({
      ...item,
      text: item.text.trim(),
    }))
    .filter((item) => item.text.length > 0)
    .sort(comparePdfTextItems)
    .map((item, index) => ({
      id: toStableIdentifier('source-block', index + 1),
      order: index + 1,
      page: item.page,
      text: item.text,
      type: toSourceBlockType(item.text),
    }))

  if (sourceBlocks.length === 0) {
    throw new ResumeInterpretationDomainError('empty-document')
  }

  const sections: LogicalSectionDraft[] = []
  let currentSection: LogicalSectionDraft | null = null

  for (const sourceBlock of sourceBlocks) {
    const sectionKind = sectionHeadingKinds[normalizeHeading(sourceBlock.text)]

    if (sourceBlock.type === 'heading' && sectionKind !== undefined) {
      currentSection = createSection(
        sourceBlock.text,
        sectionKind,
        sections.length + 1,
      )
      sections.push(currentSection)
      continue
    }

    if (sourceBlock.type === 'contact') {
      continue
    }

    currentSection ??= createOtherSection()

    if (!sections.includes(currentSection)) {
      sections.push(currentSection)
    }

    currentSection.items.push({
      evidenceRefs: [sourceBlock.id],
      id: toStableIdentifier('item', sourceBlock.order),
      text: sourceBlock.text,
    })
  }

  const populatedSections = sections.filter(
    (section) => section.items.length > 0,
  )

  if (populatedSections.length === 0) {
    throw new ResumeInterpretationDomainError('empty-document')
  }

  return resumeInterpretationStructuredContentSchema.parse({
    sections: populatedSections,
    sourceBlocks,
  })
}

export async function calculateResumeInterpretationSha256(
  content: ResumeInterpretationStructuredContent,
): Promise<string> {
  const parsedContent =
    resumeInterpretationStructuredContentSchema.parse(content)
  const serialized = JSON.stringify({
    sections: parsedContent.sections.map((section) => ({
      heading: section.heading,
      id: section.id,
      items: section.items.map((item) => ({
        evidenceRefs: item.evidenceRefs,
        id: item.id,
        text: item.text,
      })),
      kind: section.kind,
    })),
    sourceBlocks: parsedContent.sourceBlocks.map((sourceBlock) => ({
      id: sourceBlock.id,
      order: sourceBlock.order,
      page: sourceBlock.page,
      text: sourceBlock.text,
      type: sourceBlock.type,
    })),
  })
  const bytes = new TextEncoder().encode(serialized)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
