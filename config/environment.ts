import { z } from 'zod'

const isHttpUrl = (value: string): boolean => {
  if (value.length === 0) {
    return true
  }

  try {
    const url = new URL(value)

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0
    )
  } catch {
    return false
  }
}

const publishableKeyPrefix = 'sb_publishable_'

const isPublishableKey = (value: string): boolean =>
  value.length === 0 ||
  (value.startsWith(publishableKeyPrefix) &&
    value.length > publishableKeyPrefix.length)

const environmentSchema = z.object({
  NUXT_PUBLIC_APP_NAME: z
    .string()
    .trim()
    .min(1, 'NUXT_PUBLIC_APP_NAME must not be empty')
    .default('ResumAI'),
  NUXT_PUBLIC_SUPABASE_URL: z
    .string({ error: 'NUXT_PUBLIC_SUPABASE_URL is required' })
    .trim()
    .min(1, 'NUXT_PUBLIC_SUPABASE_URL must not be empty')
    .refine(isHttpUrl, 'NUXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL'),
  NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({
      error: 'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required',
    })
    .trim()
    .min(1, 'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not be empty')
    .refine(
      isPublishableKey,
      'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key starting with sb_publishable_',
    ),
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
