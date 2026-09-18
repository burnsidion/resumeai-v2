import { describe, expect, it } from 'vitest'

import {
  MAXIMUM_INTERPRETATION_PAGE_COUNT,
  resumeInterpretationStructuredContentSchema,
} from '../../server/domain/resume-interpretations/contracts'
import {
  calculateResumeInterpretationSha256,
  calculateResumeSourceSha256,
  createResumeInterpretationStructuredContent,
  ResumeInterpretationDomainError,
} from '../../server/domain/resume-interpretations/interpret'
import { syntheticResumeExtraction } from '../fixtures/resume-interpretation'

describe('resume interpretation domain', () => {
  it('creates deterministic source blocks and conservative logical sections', () => {
    expect(
      createResumeInterpretationStructuredContent(syntheticResumeExtraction),
    ).toEqual({
      sections: [
        {
          heading: 'Other',
          id: 'section-other',
          items: [
            {
              evidenceRefs: ['source-block-001'],
              id: 'item-001',
              text: 'Jordan Example',
            },
          ],
          kind: 'other',
        },
        {
          heading: 'Experience',
          id: 'section-002',
          items: [
            {
              evidenceRefs: ['source-block-004'],
              id: 'item-004',
              text: 'Built accessible Vue interfaces.',
            },
          ],
          kind: 'experience',
        },
        {
          heading: 'Skills',
          id: 'section-003',
          items: [
            {
              evidenceRefs: ['source-block-006'],
              id: 'item-006',
              text: 'Vue and TypeScript',
            },
          ],
          kind: 'skills',
        },
      ],
      sourceBlocks: [
        {
          id: 'source-block-001',
          order: 1,
          page: 1,
          text: 'Jordan Example',
          type: 'paragraph',
        },
        {
          id: 'source-block-002',
          order: 2,
          page: 1,
          text: 'jordan@example.test',
          type: 'contact',
        },
        {
          id: 'source-block-003',
          order: 3,
          page: 1,
          text: 'Experience',
          type: 'heading',
        },
        {
          id: 'source-block-004',
          order: 4,
          page: 1,
          text: 'Built accessible Vue interfaces.',
          type: 'paragraph',
        },
        {
          id: 'source-block-005',
          order: 5,
          page: 1,
          text: 'Skills',
          type: 'heading',
        },
        {
          id: 'source-block-006',
          order: 6,
          page: 1,
          text: 'Vue and TypeScript',
          type: 'paragraph',
        },
      ],
    })
  })

  it('produces the same content hash for the same normalized interpretation', async () => {
    const interpretation = createResumeInterpretationStructuredContent(
      syntheticResumeExtraction,
    )

    await expect(
      calculateResumeInterpretationSha256(interpretation),
    ).resolves.toBe(await calculateResumeInterpretationSha256(interpretation))
  })

  it('calculates the source fingerprint from the exact original bytes', async () => {
    await expect(
      calculateResumeSourceSha256(new TextEncoder().encode('abc')),
    ).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('rejects documents that exceed the interpretation page limit', () => {
    try {
      createResumeInterpretationStructuredContent({
        ...syntheticResumeExtraction,
        pageCount: MAXIMUM_INTERPRETATION_PAGE_COUNT + 1,
      })

      throw new Error('Expected the interpretation to reject the page count.')
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeInterpretationDomainError)
      expect(error).toMatchObject<Partial<ResumeInterpretationDomainError>>({
        code: 'page-limit-exceeded',
      })
    }
  })

  it('requires logical section evidence to reference a known source block', () => {
    const interpretation = createResumeInterpretationStructuredContent(
      syntheticResumeExtraction,
    )

    expect(
      resumeInterpretationStructuredContentSchema.safeParse({
        ...interpretation,
        sections: [
          {
            ...interpretation.sections[0],
            items: [
              {
                ...interpretation.sections[0].items[0],
                evidenceRefs: ['source-block-999'],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false)
  })
})
