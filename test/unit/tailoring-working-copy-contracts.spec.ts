import { describe, expect, it } from 'vitest'

import {
  calculateTailoringWorkingCopySha256,
  createTailoringWorkingCopyProviderInput,
  createTailoringWorkingCopyRequest,
  TailoringWorkingCopyValidationError,
  validateTailoringWorkingCopy,
} from '../../server/domain/tailoring/working-copy'
import { resumeInterpretationStructuredContentSchema } from '../../server/domain/resume-interpretations/contracts'
import { syntheticTailoringFixture } from '../fixtures/tailoring'

const providerMessage = 'Sensitive provider implementation details'
const sourceResume = resumeInterpretationStructuredContentSchema.parse(
  syntheticTailoringFixture.sourceResume,
)

const workingCopy = structuredClone(syntheticTailoringFixture.workingCopy)

describe('tailoring working-copy contracts', () => {
  it('accepts a source-backed working copy and creates a deterministic hash', async () => {
    const validated = validateTailoringWorkingCopy(workingCopy, sourceResume)

    expect(validated).toEqual(workingCopy)
    await expect(calculateTailoringWorkingCopySha256(validated)).resolves.toBe(
      await calculateTailoringWorkingCopySha256(validated),
    )
  })

  it('rejects structural changes and source items from another section', () => {
    for (const proposal of [
      {
        ...workingCopy,
        sections: [...workingCopy.sections].reverse(),
      },
      {
        ...workingCopy,
        sections: [
          {
            ...workingCopy.sections[0],
            items: [workingCopy.sections[1].items[0]],
          },
          workingCopy.sections[1],
        ],
      },
    ]) {
      expect(() =>
        validateTailoringWorkingCopy(proposal, sourceResume),
      ).toThrowError(TailoringWorkingCopyValidationError)
    }
  })

  it('rejects unknown, cross-target, and contact evidence references', () => {
    for (const evidenceRefs of [
      ['source-block-999'],
      ['source-block-004'],
      ['source-block-001'],
    ]) {
      try {
        validateTailoringWorkingCopy(
          {
            ...workingCopy,
            sections: [
              {
                ...workingCopy.sections[0],
                items: [
                  {
                    ...workingCopy.sections[0].items[0],
                    evidenceRefs,
                  },
                ],
              },
              workingCopy.sections[1],
            ],
          },
          sourceResume,
        )

        throw new Error('Expected unsupported evidence to be rejected.')
      } catch (error) {
        expect(error).toMatchObject<
          Partial<TailoringWorkingCopyValidationError>
        >({
          code: 'tailoring-working-copy-invalid',
          kind: 'unsupported-evidence',
        })
        expect((error as Error).message).not.toContain(providerMessage)
        expect(JSON.stringify(error)).not.toContain(providerMessage)
      }
    }
  })

  it('requires a truthful change summary for omissions and reordering', () => {
    const expandedSourceResume =
      resumeInterpretationStructuredContentSchema.parse({
        ...sourceResume,
        sections: [
          {
            ...sourceResume.sections[0],
            items: [
              ...sourceResume.sections[0].items,
              {
                evidenceRefs: ['source-block-003'],
                id: 'item-experience-002',
                text: 'Collaborated with product and design teams.',
              },
            ],
          },
          sourceResume.sections[1],
        ],
      })
    const omittedProposal = {
      ...workingCopy,
      changeSummary: [
        ...workingCopy.changeSummary,
        {
          evidenceRefs: ['source-block-003'],
          explanation: 'Omit the less relevant collaboration detail.',
          kind: 'omitted' as const,
          targetId: 'item-experience-002',
        },
      ],
    }

    expect(
      validateTailoringWorkingCopy(omittedProposal, expandedSourceResume),
    ).toMatchObject({ changeSummary: omittedProposal.changeSummary })

    expect(() =>
      validateTailoringWorkingCopy(workingCopy, expandedSourceResume),
    ).toThrowError(TailoringWorkingCopyValidationError)
  })

  it('rejects provider-controlled persistence fields and excludes contact data from provider input', () => {
    expect(() =>
      validateTailoringWorkingCopy(
        { ...workingCopy, applicationId: 'provider-selected-application' },
        sourceResume,
      ),
    ).toThrowError(TailoringWorkingCopyValidationError)

    const request = createTailoringWorkingCopyRequest({
      analysis: { ...syntheticTailoringFixture.analysis, strengths: [] },
      jobDescription: syntheticTailoringFixture.jobDescription.text,
      sourceResume,
    })
    const providerInput = createTailoringWorkingCopyProviderInput(request)

    expect(providerInput.sourceResume.sourceBlocks).not.toContainEqual(
      expect.objectContaining({ type: 'contact' }),
    )
  })
})
