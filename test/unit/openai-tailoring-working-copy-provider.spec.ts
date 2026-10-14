import { describe, expect, it } from 'vitest'

import {
  createTailoringWorkingCopyRequest,
  tailoringWorkingCopyProposalSchema,
  type TailoringWorkingCopyProposal,
} from '../../server/domain/tailoring/working-copy'
import {
  createOpenAiTailoringWorkingCopyProvider,
  type OpenAiTailoringWorkingCopyProviderError,
  type OpenAiTailoringWorkingCopyTransport,
  type OpenAiTailoringWorkingCopyTransportRequest,
} from '../../server/infrastructure/openai/tailoring-working-copy-provider'
import { syntheticTailoringFixture } from '../fixtures/tailoring'

const providerMessage = 'Sensitive OpenAI provider details'
const configuration = {
  apiKey: 'sensitive-test-key',
  model: 'test-tailoring-model',
}

const request = createTailoringWorkingCopyRequest({
  analysis: { ...syntheticTailoringFixture.analysis, strengths: [] },
  jobDescription: syntheticTailoringFixture.jobDescription.text,
  sourceResume: syntheticTailoringFixture.sourceResume,
})

const proposal: TailoringWorkingCopyProposal =
  tailoringWorkingCopyProposalSchema.parse(
    syntheticTailoringFixture.workingCopy,
  )

const createFakeTransport = (
  response: Awaited<ReturnType<OpenAiTailoringWorkingCopyTransport['parse']>>,
): {
  requests: OpenAiTailoringWorkingCopyTransportRequest[]
  transport: OpenAiTailoringWorkingCopyTransport
} => {
  const requests: OpenAiTailoringWorkingCopyTransportRequest[] = []

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

describe('OpenAI tailoring working-copy provider', () => {
  it('uses structured output, no provider storage, and the private source projection', async () => {
    const fake = createFakeTransport({
      outputParsed: proposal,
      status: 'completed',
    })
    const provider = createOpenAiTailoringWorkingCopyProvider(configuration, {
      transport: fake.transport,
    })

    await expect(provider.propose(request)).resolves.toEqual(proposal)
    expect(provider.metadata).toEqual({
      modelName: configuration.model,
      promptVersion: 'v1',
      providerName: 'openai-responses',
    })
    expect(fake.requests).toEqual([
      expect.objectContaining({ model: configuration.model, store: false }),
    ])

    const providerInput = JSON.parse(fake.requests[0].input) as {
      sourceResume: { sourceBlocks: Array<{ type: string }> }
    }

    expect(providerInput.sourceResume.sourceBlocks).not.toContainEqual(
      expect.objectContaining({ type: 'contact' }),
    )
  })

  it('maps incomplete and malformed responses to stable, sanitized failures', async () => {
    for (const response of [
      { outputParsed: proposal, status: 'incomplete' },
      { outputParsed: { message: providerMessage }, status: 'completed' },
    ]) {
      const fake = createFakeTransport(response)
      const provider = createOpenAiTailoringWorkingCopyProvider(configuration, {
        transport: fake.transport,
      })

      await expect(provider.propose(request)).rejects.toMatchObject({
        code: 'tailoring-working-copy-unavailable',
      } satisfies Partial<OpenAiTailoringWorkingCopyProviderError>)

      try {
        await provider.propose(request)
      } catch (error) {
        expect((error as Error).message).not.toContain(providerMessage)
        expect(JSON.stringify(error)).not.toContain(providerMessage)
      }
    }
  })
})
