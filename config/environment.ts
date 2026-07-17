import { z } from 'zod'

const environmentSchema = z.object({
  NUXT_PUBLIC_APP_NAME: z
    .string()
    .trim()
    .min(1, 'NUXT_PUBLIC_APP_NAME must not be empty')
    .default('ResumAI'),
})

export type Environment = z.infer<typeof environmentSchema>

export function parseEnvironment(
  environment: Record<string, string | undefined>,
): Environment {
  const result = environmentSchema.safeParse(environment)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid environment configuration: ${details}`)
  }

  return result.data
}
