import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import { expect, type BrowserContext, test } from '@playwright/test'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import { getDashboardProductData } from '../../server/services/dashboard-product-data'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? 'http://127.0.0.1:3000'
const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

interface AuthenticatedTestUser {
  client: SupabaseClient<Database>
  user: User
}

interface ProductFixture {
  applicationId: string
  baseResumeId: string
  workingCopyId: string
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
      {
        message: `waiting for the confirmation email sent to ${email}`,
        timeout: 15_000,
      },
    )
    .toBe(200)

  const messagePage = await context.newPage()

  try {
    await messagePage.goto(messageUrl.toString())

    const confirmationLink = messagePage
      .locator('a[href*="/auth/v1/verify"]')
      .first()

    await expect(confirmationLink).toBeVisible()

    const confirmationUrl = await confirmationLink.getAttribute('href')

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
): Promise<AuthenticatedTestUser> => {
  const client = createSupabaseClient()
  const identifier = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const credentials = {
    email: `owl21-${identifier}@example.test`,
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

  return {
    client,
    user: data.user,
  }
}

const createProductFixture = async (
  authenticatedUser: AuthenticatedTestUser,
  label: string,
): Promise<ProductFixture> => {
  const applicationId = crypto.randomUUID()
  const baseResumeId = crypto.randomUUID()
  const interpretationId = crypto.randomUUID()
  const workingCopyId = crypto.randomUUID()
  const resumeHash = 'a'.repeat(64)
  const interpretationHash = 'b'.repeat(64)

  const { error: baseResumeError } = await authenticatedUser.client
    .from('base_resumes')
    .insert({
      active_slot: 1,
      content_sha256: resumeHash,
      original_filename: `${label} Resume.pdf`,
      id: baseResumeId,
      size_bytes: 1024,
      storage_object_key: `${authenticatedUser.user.id}/${baseResumeId}.pdf`,
      user_id: authenticatedUser.user.id,
    })

  expect(baseResumeError).toBeNull()

  const { error: interpretationError } = await authenticatedUser.client
    .from('resume_interpretations')
    .insert({
      base_resume_id: baseResumeId,
      content_sha256: interpretationHash,
      id: interpretationId,
      interpreter_name: 'integration-test',
      interpreter_version: '1.0.0',
      schema_version: 1,
      source_resume_sha256: resumeHash,
      structured_content: { sections: [] },
      user_id: authenticatedUser.user.id,
    })

  expect(interpretationError).toBeNull()

  const { error: applicationError } = await authenticatedUser.client
    .from('applications')
    .insert({
      company: `${label} Company`,
      id: applicationId,
      role: `${label} Engineer`,
      selected_base_resume_id: baseResumeId,
      status: label === 'Owner One' ? 'interviewing' : 'applied',
      user_id: authenticatedUser.user.id,
    })

  expect(applicationError).toBeNull()

  const { error: workingCopyError } = await authenticatedUser.client
    .from('working_copies')
    .insert({
      application_id: applicationId,
      change_summary: [],
      content_sha256: 'c'.repeat(64),
      id: workingCopyId,
      model_name: 'integration-test-model',
      prompt_version: 'integration-test-v1',
      provider_name: 'integration-test-provider',
      source_base_resume_id: baseResumeId,
      source_interpretation_id: interpretationId,
      source_interpretation_sha256: interpretationHash,
      source_resume_sha256: resumeHash,
      state: 'awaiting_review',
      structured_content: { sections: [] },
      user_id: authenticatedUser.user.id,
    })

  expect(workingCopyError).toBeNull()

  return {
    applicationId,
    baseResumeId,
    workingCopyId,
  }
}

test('returns only authenticated owner data through the server product-data layer', async ({
  context,
}) => {
  const ownerOne = await createAuthenticatedTestUser(context)
  const ownerTwo = await createAuthenticatedTestUser(context)
  const ownerOneFixture = await createProductFixture(ownerOne, 'Owner One')
  const ownerTwoFixture = await createProductFixture(ownerTwo, 'Owner Two')

  const ownerOneProductData = await getDashboardProductData({
    client: ownerOne.client,
    userId: ownerOne.user.id,
  })

  expect(ownerOneProductData.applicationSummary).toEqual({
    activeCount: 1,
    interviewCount: 1,
  })
  expect(ownerOneProductData.recentApplications).toHaveLength(1)
  expect(ownerOneProductData.recentApplications[0]?.id).toBe(
    ownerOneFixture.applicationId,
  )
  expect(ownerOneProductData.recentApplications).not.toContainEqual(
    expect.objectContaining({ id: ownerTwoFixture.applicationId }),
  )
  expect(ownerOneProductData.baseResumes).toMatchObject({
    activeCount: 1,
    activeLimit: 3,
    items: [{ id: ownerOneFixture.baseResumeId }],
  })
  expect(ownerOneProductData.readyForReview).toMatchObject({
    applicationId: ownerOneFixture.applicationId,
    workingCopyId: ownerOneFixture.workingCopyId,
  })

  await expect(
    getDashboardProductData({
      client: ownerOne.client,
      userId: ownerTwo.user.id,
    }),
  ).resolves.toEqual({
    applicationSummary: {
      activeCount: 0,
      interviewCount: 0,
    },
    baseResumes: {
      activeCount: 0,
      activeLimit: 3,
      items: [],
    },
    readyForReview: null,
    recentApplications: [],
  })
})
