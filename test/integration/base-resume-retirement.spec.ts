import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import {
  expect,
  type APIResponse,
  type BrowserContext,
  type Page,
  test,
} from '@playwright/test'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  retireBaseResumeResponseSchema,
  type RetireBaseResumeResponse,
} from '../../shared/base-resumes/retirement'
import { uploadBaseResumeResponseSchema } from '../../shared/base-resumes/upload'
import { baseResumesManagementViewModelSchema } from '../../shared/base-resumes/view-model'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? 'http://127.0.0.1:3000'
const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const bucketName = 'base-resumes'
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

interface DisposableCredentials {
  email: string
  password: string
}

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

const createDisposableCredentials = (): DisposableCredentials => {
  const identifier = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`

  return {
    email: `owl32-${identifier}@example.test`,
    password: `ResumAI-test-${crypto.randomUUID()}`,
  }
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
  page: Page,
): Promise<AuthenticatedTestUser> => {
  const client = createSupabaseClient()
  const credentials = createDisposableCredentials()
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

  await page.goto(new URL('/sign-in', applicationUrl).toString(), {
    waitUntil: 'networkidle',
  })
  await page.getByLabel('Email address').fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

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

const createPdfBody = (label: string): Buffer =>
  Buffer.from(`%PDF-1.7\n% ResumAI ${label}\n%%EOF`)

const uploadBaseResume = (
  context: BrowserContext,
  input: {
    body: Buffer
    filename: string
  },
): Promise<APIResponse> =>
  context.request.post(
    new URL('/api/base-resumes', applicationUrl).toString(),
    {
      multipart: {
        file: {
          buffer: input.body,
          mimeType: 'application/pdf',
          name: input.filename,
        },
      },
    },
  )

const retireBaseResume = (
  context: BrowserContext,
  id: string,
): Promise<APIResponse> =>
  context.request.post(
    new URL(`/api/base-resumes/${id}/retire`, applicationUrl).toString(),
  )

const expectRetirementSuccess = async (
  response: APIResponse,
): Promise<RetireBaseResumeResponse> => {
  expect(response.status()).toBe(200)

  return retireBaseResumeResponseSchema.parse(await response.json())
}

const expectRetirementFailure = async (
  response: APIResponse,
  expected: { code: string; status: number },
): Promise<void> => {
  expect(response.status()).toBe(expected.status)
  await expect(response.json()).resolves.toMatchObject({
    data: { code: expected.code },
  })
}

test('retires only the owned source while preserving its row, PDF, and reusable slot', async ({
  browser,
  context,
  page,
}) => {
  const unauthenticatedResponse = await retireBaseResume(
    context,
    crypto.randomUUID(),
  )

  await expectRetirementFailure(unauthenticatedResponse, {
    code: 'authentication-required',
    status: 401,
  })

  const owner = await createAuthenticatedTestUser(context, page)
  const originalBody = createPdfBody('retirement-original')
  const uploadResponse = await uploadBaseResume(context, {
    body: originalBody,
    filename: 'Original Source.pdf',
  })

  expect(uploadResponse.status()).toBe(201)

  const uploaded = uploadBaseResumeResponseSchema.parse(
    await uploadResponse.json(),
  ).baseResume
  const objectKey = `${owner.user.id}/${uploaded.id}.pdf`
  const { data: rowBefore, error: rowBeforeError } = await owner.client
    .from('base_resumes')
    .select(
      'id,user_id,original_filename,storage_object_key,content_type,size_bytes,content_sha256,active_slot,retired_at,created_at',
    )
    .eq('id', uploaded.id)
    .single()

  expect(rowBeforeError).toBeNull()
  expect(rowBefore).not.toBeNull()

  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()

  try {
    await createAuthenticatedTestUser(otherContext, otherPage)

    const crossOwnerResponse = await retireBaseResume(otherContext, uploaded.id)

    await expectRetirementFailure(crossOwnerResponse, {
      code: 'base-resume-unavailable',
      status: 404,
    })
  } finally {
    await otherContext.close()
  }

  const firstRetirement = await expectRetirementSuccess(
    await retireBaseResume(context, uploaded.id),
  )
  const repeatedRetirement = await expectRetirementSuccess(
    await retireBaseResume(context, uploaded.id),
  )

  expect(repeatedRetirement).toEqual(firstRetirement)

  const { data: rowAfter, error: rowAfterError } = await owner.client
    .from('base_resumes')
    .select(
      'id,user_id,original_filename,storage_object_key,content_type,size_bytes,content_sha256,active_slot,retired_at,created_at',
    )
    .eq('id', uploaded.id)
    .single()

  expect(rowAfterError).toBeNull()
  expect(rowAfter).toEqual({
    ...rowBefore,
    active_slot: null,
    retired_at: firstRetirement.baseResume.retiredAt,
  })

  const { data: storedPdf, error: storedPdfError } = await owner.client.storage
    .from(bucketName)
    .download(objectKey)

  expect(storedPdfError).toBeNull()
  expect(storedPdf).not.toBeNull()

  if (!storedPdf) {
    throw new Error('The retired source PDF was not preserved.')
  }

  expect(Buffer.from(await storedPdf.arrayBuffer())).toEqual(originalBody)

  const activeResponse = await context.request.get(
    new URL('/api/base-resumes', applicationUrl).toString(),
  )

  expect(activeResponse.status()).toBe(200)

  const activeViewModel = baseResumesManagementViewModelSchema.parse(
    await activeResponse.json(),
  )

  expect(activeViewModel.activeCount).toBe(0)
  expect(activeViewModel.items).toEqual([])

  const replacementResponse = await uploadBaseResume(context, {
    body: createPdfBody('retirement-replacement'),
    filename: 'Replacement Source.pdf',
  })

  expect(replacementResponse.status()).toBe(201)
  expect(
    uploadBaseResumeResponseSchema.parse(await replacementResponse.json())
      .baseResume.activeSlot,
  ).toBe(1)
})
