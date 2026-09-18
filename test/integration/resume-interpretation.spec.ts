import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import { expect, type BrowserContext, test } from '@playwright/test'

import {
  RESUME_INTERPRETATION_SCHEMA_VERSION,
  RESUME_INTERPRETER_NAME,
  RESUME_INTERPRETER_VERSION,
} from '../../server/domain/resume-interpretations/contracts'
import { calculateResumeSourceSha256 } from '../../server/domain/resume-interpretations/interpret'
import type { Database } from '../../server/infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from '../../server/repositories/product-data/context'
import {
  ensureResumeInterpretation,
  type EnsureResumeInterpretationServiceError,
} from '../../server/services/ensure-resume-interpretation'
import { createSyntheticResumePdf } from '../fixtures/resume-interpretation'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? 'http://127.0.0.1:3000'
const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const bucketName = 'base-resumes'
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

interface AuthenticatedTestUser {
  client: SupabaseClient<Database>
  user: User
}

const requireLocalSupabaseConfiguration = (): {
  publishableKey: string
  url: string
} => {
  if (!supabaseUrl) {
    throw new Error('The local Supabase URL is required.')
  }

  if (!supabasePublishableKey) {
    throw new Error('The local Supabase publishable key is required.')
  }

  return {
    publishableKey: supabasePublishableKey,
    url: supabaseUrl,
  }
}

const createSupabaseClient = (): SupabaseClient<Database> => {
  const configuration = requireLocalSupabaseConfiguration()

  return createClient<Database>(
    configuration.url,
    configuration.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  )
}

const getConfirmationUrl = async (
  context: BrowserContext,
  email: string,
): Promise<string> => {
  const messageUrl = new URL('/view/latest.html', mailpitUrl)
  messageUrl.searchParams.set('query', `to:${email}`)

  await expect
    .poll(
      async () => {
        const response = await context.request.get(messageUrl.toString())
        return response.status()
      },
      { timeout: 15_000 },
    )
    .toBe(200)

  const messagePage = await context.newPage()

  try {
    await messagePage.goto(messageUrl.toString())

    const confirmationUrl = await messagePage
      .locator('a[href*="/auth/v1/verify"]')
      .first()
      .getAttribute('href')

    if (!confirmationUrl) {
      throw new Error('The confirmation email did not contain a usable link.')
    }

    const parsedUrl = new URL(confirmationUrl)

    expect(loopbackHosts.has(parsedUrl.hostname)).toBe(true)
    expect(parsedUrl.protocol).toBe('http:')
    expect(parsedUrl.pathname).toBe('/auth/v1/verify')

    return confirmationUrl
  } finally {
    await messagePage.close()
  }
}

const createAuthenticatedTestUser = async (
  context: BrowserContext,
  label: string,
): Promise<AuthenticatedTestUser> => {
  const client = createSupabaseClient()
  const identifier = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const credentials = {
    email: `owl48-${label}-${identifier}@example.test`,
    password: `ResumAI-test-${crypto.randomUUID()}`,
  }
  const { error: signUpError } = await client.auth.signUp({
    email: credentials.email,
    options: {
      emailRedirectTo: new URL('/auth/callback', applicationUrl).toString(),
    },
    password: credentials.password,
  })

  expect(signUpError).toBeNull()

  const confirmationUrl = await getConfirmationUrl(context, credentials.email)
  const confirmationResponse = await context.request.get(confirmationUrl, {
    maxRedirects: 0,
  })

  expect([302, 303]).toContain(confirmationResponse.status())

  const { data, error: signInError } =
    await client.auth.signInWithPassword(credentials)

  expect(signInError).toBeNull()
  expect(data.user).not.toBeNull()

  if (!data.user) {
    throw new Error('The disposable user did not receive a session.')
  }

  return { client, user: data.user }
}

const createContext = (
  authenticatedUser: AuthenticatedTestUser,
): ProductDataRepositoryContext => ({
  client: authenticatedUser.client,
  userId: authenticatedUser.user.id,
})

const createTrackedBaseResume = async (
  authenticatedUser: AuthenticatedTestUser,
): Promise<{ id: string; sourceSha256: string }> => {
  const id = crypto.randomUUID()
  const bytes = createSyntheticResumePdf()
  const sourceSha256 = await calculateResumeSourceSha256(bytes)
  const storageObjectKey = `${authenticatedUser.user.id}/${id}.pdf`
  const { data: uploadedObject, error: uploadError } =
    await authenticatedUser.client.storage
      .from(bucketName)
      .upload(storageObjectKey, bytes, {
        contentType: 'application/pdf',
        upsert: false,
      })

  expect(uploadError).toBeNull()
  expect(uploadedObject?.path).toBe(storageObjectKey)

  const { error: insertError } = await authenticatedUser.client
    .from('base_resumes')
    .insert({
      active_slot: 1,
      content_sha256: sourceSha256,
      id,
      original_filename: 'OWL-48 Source Resume.pdf',
      size_bytes: bytes.byteLength,
      storage_object_key: storageObjectKey,
      user_id: authenticatedUser.user.id,
    })

  expect(insertError).toBeNull()

  return { id, sourceSha256 }
}

const createApplication = async (
  authenticatedUser: AuthenticatedTestUser,
  selectedBaseResumeId: string,
): Promise<string> => {
  const { data, error } = await authenticatedUser.client
    .from('applications')
    .insert({
      company: 'ResumAI Test Company',
      role: 'Resume Interpretation Engineer',
      selected_base_resume_id: selectedBaseResumeId,
      status: 'draft',
      user_id: authenticatedUser.user.id,
    })
    .select('id')
    .single()

  expect(error).toBeNull()
  expect(data?.id).toBeTruthy()

  if (!data) {
    throw new Error('The test application was not created.')
  }

  return data.id
}

test('creates and reuses only the owner-scoped immutable interpretation of an active selected PDF', async ({
  context,
}) => {
  const owner = await createAuthenticatedTestUser(context, 'owner')
  const otherUser = await createAuthenticatedTestUser(context, 'other')
  const source = await createTrackedBaseResume(owner)
  const applicationId = await createApplication(owner, source.id)

  const first = await ensureResumeInterpretation(
    createContext(owner),
    applicationId,
  )
  const second = await ensureResumeInterpretation(
    createContext(owner),
    applicationId,
  )

  expect(second.id).toBe(first.id)
  expect(first).toMatchObject({
    baseResumeId: source.id,
    interpreterName: RESUME_INTERPRETER_NAME,
    interpreterVersion: RESUME_INTERPRETER_VERSION,
    schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
    sourceResumeSha256: source.sourceSha256,
  })
  expect(first.structuredContent.sourceBlocks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: 'Experience' }),
      expect.objectContaining({ text: 'Skills' }),
    ]),
  )

  const { data: ownerRows, error: ownerReadError } = await owner.client
    .from('resume_interpretations')
    .select(
      'id,base_resume_id,user_id,source_resume_sha256,interpreter_name,interpreter_version,schema_version',
    )
    .eq('base_resume_id', source.id)

  expect(ownerReadError).toBeNull()
  expect(ownerRows).toEqual([
    expect.objectContaining({
      base_resume_id: source.id,
      id: first.id,
      interpreter_name: RESUME_INTERPRETER_NAME,
      interpreter_version: RESUME_INTERPRETER_VERSION,
      schema_version: RESUME_INTERPRETATION_SCHEMA_VERSION,
      source_resume_sha256: source.sourceSha256,
      user_id: owner.user.id,
    }),
  ])

  await expect(
    ensureResumeInterpretation(createContext(otherUser), applicationId),
  ).rejects.toMatchObject({
    code: 'resume-interpretation-unavailable',
    kind: 'source-unavailable',
  } satisfies Partial<EnsureResumeInterpretationServiceError>)

  const { data: otherRows, error: otherReadError } = await otherUser.client
    .from('resume_interpretations')
    .select('id')
    .eq('base_resume_id', source.id)

  expect(otherReadError).toBeNull()
  expect(otherRows).toEqual([])
})
