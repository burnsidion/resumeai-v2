import { describe, expect, it } from 'vitest'

import { deriveApplicationReadiness } from '../../shared/applications/readiness'

describe('application tailoring readiness', () => {
  it.each([
    {
      expected: {
        isReady: false,
        missingRequirements: ['job-description', 'base-resume'],
      },
      input: { jobDescription: null, selectedBaseResumeAvailable: false },
      state: 'both requirements are missing',
    },
    {
      expected: {
        isReady: false,
        missingRequirements: ['job-description'],
      },
      input: { jobDescription: '   ', selectedBaseResumeAvailable: true },
      state: 'only the job description is missing',
    },
    {
      expected: {
        isReady: false,
        missingRequirements: ['base-resume'],
      },
      input: {
        jobDescription: 'Build accessible products.',
        selectedBaseResumeAvailable: false,
      },
      state: 'only the base resume is missing',
    },
    {
      expected: { isReady: true, missingRequirements: [] },
      input: {
        jobDescription: 'Build accessible products.',
        selectedBaseResumeAvailable: true,
      },
      state: 'both requirements are present',
    },
  ] as const)('derives readiness when $state', ({ expected, input }) => {
    expect(deriveApplicationReadiness(input)).toEqual(expected)
  })
})
