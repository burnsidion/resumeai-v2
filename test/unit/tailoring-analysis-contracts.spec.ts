import { describe, expect, it } from 'vitest'

import {
  createTailoringAnalysisProviderInput,
  createTailoringAnalysisRequest,
  TailoringAnalysisValidationError,
  validateTailoringAnalysis,
} from '../../server/domain/tailoring/analysis'
import { resumeInterpretationStructuredContentSchema } from '../../server/domain/resume-interpretations/contracts'
import { syntheticTailoringFixture } from '../fixtures/tailoring'

const providerMessage = 'Sensitive provider implementation details'
const sourceResume = resumeInterpretationStructuredContentSchema.parse(
  syntheticTailoringFixture.sourceResume,
)

describe('tailoring analysis contracts', () => {
  it('accepts a source-backed analysis for the exact interpreted resume', () => {
    expect(
      validateTailoringAnalysis(
        {
          ...syntheticTailoringFixture.analysis,
          strengths: [
            {
              evidenceRefs: ['source-block-003'],
              explanation:
                'The existing accessibility outcome is relevant to this role.',
              targetId: 'item-experience-001',
            },
          ],
        },
        sourceResume,
      ),
    ).toEqual({
      ...syntheticTailoringFixture.analysis,
      strengths: [
        {
          evidenceRefs: ['source-block-003'],
          explanation:
            'The existing accessibility outcome is relevant to this role.',
          targetId: 'item-experience-001',
        },
      ],
    })
  })

  it('accepts source-backed findings that target an existing logical section', () => {
    expect(
      validateTailoringAnalysis(
        {
          gaps: [],
          opportunities: [
            {
              evidenceRefs: ['source-block-002', 'source-block-003'],
              explanation:
                'Keep the experience section focused on the source-backed frontend work.',
              kind: 'reorder',
              targetId: 'section-experience',
            },
          ],
          strengths: [],
        },
        sourceResume,
      ),
    ).toMatchObject({
      opportunities: [
        expect.objectContaining({ targetId: 'section-experience' }),
      ],
    })
  })

  it('rejects a finding with an unknown or cross-target evidence reference', () => {
    for (const evidenceRefs of [
      syntheticTailoringFixture.unknownEvidenceReference.evidenceRefs,
      ['source-block-004'],
    ]) {
      try {
        validateTailoringAnalysis(
          {
            gaps: [],
            opportunities: [
              {
                evidenceRefs,
                explanation: 'Sensitive provider implementation details',
                kind: 'rewrite',
                targetId: 'item-experience-001',
              },
            ],
            strengths: [],
          },
          sourceResume,
        )

        throw new Error('Expected unsupported evidence to be rejected.')
      } catch (error) {
        expect(error).toMatchObject<Partial<TailoringAnalysisValidationError>>({
          code: 'tailoring-analysis-invalid',
          kind: 'unsupported-evidence',
        })
        expect((error as Error).message).not.toContain(providerMessage)
        expect(JSON.stringify(error)).not.toContain(providerMessage)
      }
    }
  })

  it('rejects malformed, incomplete, or provider-controlled output fields', () => {
    for (const analysis of [
      {
        gaps: [],
        opportunities: [],
      },
      {
        ...syntheticTailoringFixture.analysis,
        applicationId: 'provider-selected-application',
        strengths: [],
      },
      {
        gaps: [],
        opportunities: [
          {
            evidenceRefs: ['source-block-003'],
            explanation: providerMessage,
            kind: 'unsupported-kind',
            targetId: 'item-experience-001',
          },
        ],
        strengths: [],
      },
    ]) {
      expect(() =>
        validateTailoringAnalysis(analysis, sourceResume),
      ).toThrowError(TailoringAnalysisValidationError)
    }
  })

  it('requires a non-empty job description and the exact structured resume', () => {
    try {
      createTailoringAnalysisRequest({
        jobDescription: '   ',
        sourceResume,
      })

      throw new Error('Expected the blank job description to be rejected.')
    } catch (error) {
      expect(error).toMatchObject<Partial<TailoringAnalysisValidationError>>({
        code: 'tailoring-analysis-invalid',
        kind: 'invalid-structure',
      })
    }

    expect(
      createTailoringAnalysisRequest({
        jobDescription: syntheticTailoringFixture.jobDescription.text,
        sourceResume,
      }),
    ).toMatchObject({
      jobDescription: syntheticTailoringFixture.jobDescription.text,
    })
  })

  it('excludes contact source blocks from the provider input and valid evidence', () => {
    const request = createTailoringAnalysisRequest({
      jobDescription: syntheticTailoringFixture.jobDescription.text,
      sourceResume,
    })
    const providerInput = createTailoringAnalysisProviderInput(request)

    expect(providerInput.sourceResume.sourceBlocks).not.toContainEqual(
      expect.objectContaining({ type: 'contact' }),
    )

    expect(() =>
      validateTailoringAnalysis(
        {
          gaps: [],
          opportunities: [
            {
              evidenceRefs: ['source-block-001'],
              explanation: 'Use the contact information from the source.',
              kind: 'rewrite',
              targetId: 'item-experience-001',
            },
          ],
          strengths: [],
        },
        {
          ...sourceResume,
          sections: [
            {
              ...sourceResume.sections[0],
              items: [
                {
                  ...sourceResume.sections[0].items[0],
                  evidenceRefs: ['source-block-001'],
                },
              ],
            },
          ],
        },
      ),
    ).toThrowError(TailoringAnalysisValidationError)
  })
})
