import { describe, expect, it } from 'vitest'

import { syntheticTailoringFixture } from '../fixtures/tailoring'

describe('tailoring fixtures', () => {
  it('uses a synthetic reserved-domain identity', () => {
    const contactBlock = syntheticTailoringFixture.sourceResume.sourceBlocks[0]

    expect(contactBlock.type).toBe('contact')
    expect(contactBlock.text).toContain('jordan@example.test')
  })

  it('provides stable source evidence for valid and invalid examples', () => {
    const sourceBlockIds = new Set(
      syntheticTailoringFixture.sourceResume.sourceBlocks.map(({ id }) => id),
    )

    expect(
      syntheticTailoringFixture.workingCopy.sections
        .flatMap((section) =>
          section.items.flatMap((item) => item.evidenceRefs),
        )
        .every((id) => sourceBlockIds.has(id)),
    ).toBe(true)
    expect(
      syntheticTailoringFixture.analysis.opportunities[0].evidenceRefs.every(
        (id) => sourceBlockIds.has(id),
      ),
    ).toBe(true)
    expect(sourceBlockIds).not.toContain(
      syntheticTailoringFixture.unknownEvidenceReference.evidenceRefs[0],
    )
  })

  it('keeps the unsupported-claim fixture distinct from source text', () => {
    const sourceText = syntheticTailoringFixture.sourceResume.sourceBlocks
      .map(({ text }) => text)
      .join('\n')

    expect(sourceText).not.toContain('Kubernetes infrastructure')
    expect(syntheticTailoringFixture.unsupportedClaim.text).toContain(
      'Kubernetes infrastructure',
    )
  })
})
