export const syntheticTailoringFixture = {
  analysis: {
    gaps: [
      {
        explanation:
          'The source resume does not provide direct evidence of Kubernetes experience.',
        requirement: 'Kubernetes',
      },
    ],
    opportunities: [
      {
        evidenceRefs: ['source-block-003'],
        explanation:
          'Emphasize the existing accessibility outcome because the role values inclusive product work.',
        kind: 'rewrite',
        targetId: 'item-experience-001',
      },
    ],
  },
  jobDescription: {
    text: 'Build accessible web products with Vue and TypeScript. Experience with Kubernetes is preferred.',
  },
  sourceResume: {
    sections: [
      {
        heading: 'Experience',
        id: 'section-experience',
        items: [
          {
            evidenceRefs: ['source-block-002', 'source-block-003'],
            id: 'item-experience-001',
            text: 'Built accessible Vue interfaces used by 20,000 customers.',
          },
        ],
        kind: 'experience',
      },
      {
        heading: 'Skills',
        id: 'section-skills',
        items: [
          {
            evidenceRefs: ['source-block-004'],
            id: 'item-skills-001',
            text: 'Vue, TypeScript, accessibility testing',
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
        text: 'Jordan Example | jordan@example.test',
        type: 'contact',
      },
      {
        id: 'source-block-002',
        order: 2,
        page: 1,
        text: 'Frontend Engineer | Lumenworks Studio | 2023–Present',
        type: 'position-metadata',
      },
      {
        id: 'source-block-003',
        order: 3,
        page: 1,
        text: 'Built accessible Vue interfaces used by 20,000 customers.',
        type: 'bullet',
      },
      {
        id: 'source-block-004',
        order: 4,
        page: 1,
        text: 'Vue, TypeScript, accessibility testing',
        type: 'paragraph',
      },
    ],
  },
  unsupportedClaim: {
    evidenceRefs: ['source-block-003'],
    text: 'Built Kubernetes infrastructure used by 20,000 customers.',
  },
  unknownEvidenceReference: {
    evidenceRefs: ['source-block-999'],
    text: 'Built accessible Vue interfaces used by 20,000 customers.',
  },
  workingCopy: {
    changeSummary: [
      {
        evidenceRefs: ['source-block-003'],
        explanation:
          'Rewrote this existing bullet to foreground accessible Vue product work.',
        kind: 'rewritten',
        targetId: 'item-experience-001',
      },
    ],
    sections: [
      {
        heading: 'Experience',
        id: 'section-experience',
        items: [
          {
            evidenceRefs: ['source-block-003'],
            id: 'item-experience-001',
            text: 'Developed accessible Vue product interfaces serving 20,000 customers.',
          },
        ],
        kind: 'experience',
      },
      {
        heading: 'Skills',
        id: 'section-skills',
        items: [
          {
            evidenceRefs: ['source-block-004'],
            id: 'item-skills-001',
            text: 'Vue, TypeScript, accessibility testing',
          },
        ],
        kind: 'skills',
      },
    ],
  },
} as const
