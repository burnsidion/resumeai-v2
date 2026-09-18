import { describe, expect, it } from 'vitest'

import {
  createTailoringAnalysisRequest,
  tailoringAnalysisSchema,
  type TailoringAnalysis,
} from '../../server/domain/tailoring/analysis'
import {
  getOpenAiTailoringConfiguration,
  OpenAiTailoringConfigurationError,
} from '../../server/infrastructure/openai/tailoring-configuration'
import {
  createOpenAiTailoringAnalysisProvider,
  type OpenAiTailoringAnalysisTransport,
  type OpenAiTailoringAnalysisTransportRequest,
  type OpenAiTailoringAnalysisProviderError,
} from '../../server/infrastructure/openai/tailoring-analysis-provider'
import { syntheticTailoringFixture } from '../fixtures/tailoring'

const providerMessage = 'Sensitive OpenAI provider details'

const request = createTailoringAnalysisRequest({
  jobDescription: syntheticTailoringFixture.jobDescription.text,
  sourceResume: syntheticTailoringFixture.sourceResume,
})

const validAnalysis: TailoringAnalysis = tailoringAnalysisSchema.parse({
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

const configuration = {
  apiKey: 'sensitive-test-key',
  model: 'test-tailoring-model',
}

const createFakeTransport = (
  response: Awaited<ReturnType<OpenAiTailoringAnalysisTransport['parse']>>,
): {
  requests: OpenAiTailoringAnalysisTransportRequest[]
  transport: OpenAiTailoringAnalysisTransport
} => {
  const requests: OpenAiTailoringAnalysisTransportRequest[] = []

  return {
    requests,
    transport: {
      async parse(providerRequest) {
        requests.push(providerRequest)
        return response
      },
    },
  }
}

describe('OpenAI tailoring configuration', () => {
  it('requires an explicit private key and model without exposing rejected values', () => {
    const rejectedKey = 'sensitive-rejected-key'

    expect(() =>
      getOpenAiTailoringConfiguration({
        OPENAI_API_KEY: rejectedKey,
      }),
    ).toThrowError(OpenAiTailoringConfigurationError)

    try {
      getOpenAiTailoringConfiguration({
        OPENAI_API_KEY: rejectedKey,
      })
    } catch (error) {
      expect((error as Error).message).not.toContain(rejectedKey)
      expect(JSON.stringify(error)).not.toContain(rejectedKey)
    }
  })

  it('trims an explicit server-only key and model', () => {
    expect(
      getOpenAiTailoringConfiguration({
        OPENAI_API_KEY: ' test-key ',
        OPENAI_TAILORING_MODEL: ' test-model ',
      }),
    ).toEqual({
      apiKey: 'test-key',
      model: 'test-model',
    })
  })
})

describe('OpenAI tailoring analysis provider', () => {
  it('uses structured output with an explicit no-storage request and private input projection', async () => {
    const fake = createFakeTransport({
      outputParsed: validAnalysis,
      status: 'completed',
    })
    const provider = createOpenAiTailoringAnalysisProvider(configuration, {
      transport: fake.transport,
    })

    await expect(provider.analyze(request)).resolves.toEqual(validAnalysis)
    expect(fake.requests).toEqual([
      expect.objectContaining({
        model: configuration.model,
        store: false,
      }),
    ])

    const providerInput = JSON.parse(fake.requests[0].input) as {
      sourceResume: { sourceBlocks: Array<{ type: string }> }
    }

    expect(providerInput.sourceResume.sourceBlocks).not.toContainEqual(
      expect.objectContaining({ type: 'contact' }),
    )
    expect(fake.requests[0].input).not.toContain(providerMessage)
  })

  it('maps incomplete and malformed provider responses to stable sanitized failures', async () => {
    for (const response of [
      {
        outputParsed: validAnalysis,
        status: 'incomplete',
      },
      {
        outputParsed: { message: providerMessage },
        status: 'completed',
      },
    ]) {
      const fake = createFakeTransport(response)
      const provider = createOpenAiTailoringAnalysisProvider(configuration, {
        transport: fake.transport,
      })

      await expect(provider.analyze(request)).rejects.toMatchObject({
        code: 'tailoring-analysis-unavailable',
      } satisfies Partial<OpenAiTailoringAnalysisProviderError>)

      try {
        await provider.analyze(request)
      } catch (error) {
        expect((error as Error).message).not.toContain(providerMessage)
        expect(JSON.stringify(error)).not.toContain(providerMessage)
      }
    }
  })
})
