import { describe, expect, it } from 'vitest'

import {
  createUnpdfResumeInterpreter,
  type PdfResumeInterpreterError,
} from '../../server/infrastructure/pdf/unpdf-resume-interpreter'
import { createSyntheticResumePdf } from '../fixtures/resume-interpretation'

describe('unpdf resume interpreter', () => {
  it('extracts positioned text from a synthetic resume PDF', async () => {
    const interpreter = createUnpdfResumeInterpreter()

    await expect(
      interpreter.extract(createSyntheticResumePdf()),
    ).resolves.toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ page: 1, text: 'Experience' }),
          expect.objectContaining({ page: 1, text: 'Skills' }),
          expect.objectContaining({
            page: 1,
            text: 'Built accessible Vue interfaces.',
          }),
        ]),
        pageCount: 1,
      }),
    )
  })

  it('maps malformed PDF bytes to a sanitized unreadable-document error', async () => {
    const interpreter = createUnpdfResumeInterpreter()

    await expect(
      interpreter.extract(new TextEncoder().encode('%PDF-1.7\ninvalid')),
    ).rejects.toMatchObject<Partial<PdfResumeInterpreterError>>({
      kind: 'unreadable-document',
    })
  })
})
