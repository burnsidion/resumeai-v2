import { z } from 'zod'

const openAiTailoringEnvironmentSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_TAILORING_MODEL: z.string().trim().min(1),
})

export interface OpenAiTailoringConfiguration {
  apiKey: string
  model: string
}

export class OpenAiTailoringConfigurationError extends Error {
  readonly code = 'openai-tailoring-configuration-invalid'

  constructor(cause?: unknown) {
    super('The AI tailoring provider is not configured.', { cause })
    this.name = 'OpenAiTailoringConfigurationError'
  }
}

export function getOpenAiTailoringConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAiTailoringConfiguration {
  const result = openAiTailoringEnvironmentSchema.safeParse({
    OPENAI_API_KEY: environment.OPENAI_API_KEY,
    OPENAI_TAILORING_MODEL: environment.OPENAI_TAILORING_MODEL,
  })

  if (!result.success) {
    throw new OpenAiTailoringConfigurationError(result.error)
  }

  return {
    apiKey: result.data.OPENAI_API_KEY,
    model: result.data.OPENAI_TAILORING_MODEL,
  }
}
