import { extractTextItems, getDocumentProxy } from 'unpdf'

import {
  MAXIMUM_INTERPRETATION_IMAGE_PIXELS,
  MAXIMUM_INTERPRETATION_PAGE_COUNT,
  type ExtractedPdfResume,
  extractedPdfResumeSchema,
} from '../../domain/resume-interpretations/contracts'

export type PdfResumeInterpreterErrorKind =
  'empty-document' | 'page-limit-exceeded' | 'unreadable-document'

export class PdfResumeInterpreterError extends Error {
  constructor(
    readonly kind: PdfResumeInterpreterErrorKind,
    cause?: unknown,
  ) {
    super('The PDF could not be interpreted.', { cause })
    this.name = 'PdfResumeInterpreterError'
  }
}

export interface PdfResumeInterpreter {
  extract(bytes: Uint8Array): Promise<ExtractedPdfResume>
}

const createInterpreterError = (
  kind: PdfResumeInterpreterErrorKind,
  cause?: unknown,
): PdfResumeInterpreterError => new PdfResumeInterpreterError(kind, cause)

export function createUnpdfResumeInterpreter(): PdfResumeInterpreter {
  return {
    async extract(bytes) {
      let document: Awaited<ReturnType<typeof getDocumentProxy>> | undefined

      try {
        document = await getDocumentProxy(bytes, {
          maxImageSize: MAXIMUM_INTERPRETATION_IMAGE_PIXELS,
        })

        if (document.numPages > MAXIMUM_INTERPRETATION_PAGE_COUNT) {
          throw createInterpreterError('page-limit-exceeded')
        }

        const result = await extractTextItems(document)
        const extraction = extractedPdfResumeSchema.parse({
          items: result.items.flatMap((pageItems, pageIndex) =>
            pageItems.map((item) => ({
              fontFamily: item.fontFamily,
              fontSize: item.fontSize,
              hasEOL: item.hasEOL,
              height: item.height,
              page: pageIndex + 1,
              text: item.str,
              width: item.width,
              x: item.x,
              y: item.y,
            })),
          ),
          pageCount: result.totalPages,
        })

        if (extraction.items.every((item) => item.text.trim().length === 0)) {
          throw createInterpreterError('empty-document')
        }

        return extraction
      } catch (error) {
        if (error instanceof PdfResumeInterpreterError) {
          throw error
        }

        throw createInterpreterError('unreadable-document', error)
      } finally {
        await document?.loadingTask.destroy().catch(() => undefined)
      }
    },
  }
}
