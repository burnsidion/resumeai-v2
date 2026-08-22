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
  BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS,
  baseResumePreviewResponseSchema,
} from '../../shared/base-resumes/preview'
import { uploadBaseResumeResponseSchema } from '../../shared/base-resumes/upload'

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
    email: `owl35-${identifier}@example.test`,
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

const createPdfBody = (): Buffer =>
  Buffer.from('%PDF-1.7\n% ResumAI OWL-35 exact preview body\n%%EOF')

const uploadBaseResume = (
  context: BrowserContext,
  body: Buffer,
  filename: string,
): Promise<APIResponse> =>
  context.request.post(
    new URL('/api/base-resumes', applicationUrl).toString(),
    {
      multipart: {
        file: {
          buffer: body,
          mimeType: 'application/pdf',
          name: filename,
        },
      },
    },
  )

const getBaseResumePreview = (
  context: BrowserContext,
  id: string,
): Promise<APIResponse> =>
  context.request.get(
    new URL(`/api/base-resumes/${id}/preview`, applicationUrl).toString(),
  )

const expectPreviewFailure = async (
  response: APIResponse,
  expected: { code: string; status: number },
): Promise<void> => {
  expect(response.status()).toBe(expected.status)
  await expect(response.json()).resolves.toMatchObject({
    data: { code: expected.code },
  })
}

test('issues exact temporary owner access while denying anonymous, cross-owner, public, and retired access', async ({
  browser,
  context,
  page,
}) => {
  const anonymousResponse = await getBaseResumePreview(
    context,
    crypto.randomUUID(),
  )

  await expectPreviewFailure(anonymousResponse, {
    code: 'authentication-required',
    status: 401,
  })

  const owner = await createAuthenticatedTestUser(context, page)
  const filename = 'OWL-35 Preview Source.pdf'
  const pdfBody = createPdfBody()
  const uploadResponse = await uploadBaseResume(context, pdfBody, filename)

  expect(uploadResponse.status()).toBe(201)

  const uploaded = uploadBaseResumeResponseSchema.parse(
    await uploadResponse.json(),
  ).baseResume
  const objectKey = `${owner.user.id}/${uploaded.id}.pdf`
  const previewRequestedAt = Date.now()
  const previewResponse = await getBaseResumePreview(context, uploaded.id)
  const previewReceivedAt = Date.now()

  expect(previewResponse.status()).toBe(200)
  expect(previewResponse.headers()['cache-control']).toContain('private')
  expect(previewResponse.headers()['cache-control']).toContain('no-store')

  const preview = baseResumePreviewResponseSchema.parse(
    await previewResponse.json(),
  ).preview

  expect(preview).toMatchObject({
    baseResumeId: uploaded.id,
    originalFilename: filename,
  })
  expect(Date.parse(preview.expiresAt)).toBeGreaterThanOrEqual(
    previewRequestedAt +
      (BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS - 5) * 1_000,
  )
  expect(Date.parse(preview.expiresAt)).toBeLessThanOrEqual(
    previewReceivedAt +
      (BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS + 5) * 1_000,
  )

  const signedUrl = new URL(preview.url)

  expect(loopbackHosts.has(signedUrl.hostname)).toBe(true)
  expect(signedUrl.protocol).toBe('http:')
  expect(signedUrl.pathname).toBe(
    `/storage/v1/object/sign/${bucketName}/${objectKey}`,
  )
  expect(signedUrl.searchParams.get('token')).toBeTruthy()

  const signedPdfResponse = await context.request.get(preview.url)

  expect(signedPdfResponse.status()).toBe(200)
  expect(signedPdfResponse.headers()['content-type']).toContain(
    'application/pdf',
  )
  expect(await signedPdfResponse.body()).toEqual(pdfBody)

  const uiPreviewRequests: string[] = []

  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname ===
        `/api/base-resumes/${uploaded.id}/preview`
    ) {
      uiPreviewRequests.push(request.url())
    }
  })

  await page.goto(new URL('/base-resumes', applicationUrl).toString(), {
    waitUntil: 'networkidle',
  })

  const resumeCard = page.getByRole('article').filter({ hasText: filename })
  const previewButton = resumeCard.getByRole('button', {
    name: `Preview ${filename}`,
  })

  await previewButton.click()

  const previewDialog = page.getByRole('dialog', { name: filename })

  await expect(previewDialog).toBeVisible()
  await expect(previewDialog).toContainText(
    'Original PDF · Private · Immutable',
  )
  await expect(previewDialog.locator('iframe')).toHaveAttribute(
    'title',
    `Preview of ${filename}`,
  )

  const embeddedPreviewUrl = await previewDialog
    .locator('iframe')
    .getAttribute('src')

  expect(embeddedPreviewUrl).not.toBeNull()

  if (!embeddedPreviewUrl) {
    throw new Error('The preview dialog did not receive a signed PDF URL.')
  }

  const embeddedSignedUrl = new URL(embeddedPreviewUrl)

  expect(loopbackHosts.has(embeddedSignedUrl.hostname)).toBe(true)
  expect(embeddedSignedUrl.pathname).toBe(
    `/storage/v1/object/sign/${bucketName}/${objectKey}`,
  )
  expect(embeddedSignedUrl.searchParams.get('token')).toBeTruthy()
  await expect(
    previewDialog.getByRole('link', { name: 'Open in new tab' }),
  ).toHaveAttribute('href', embeddedPreviewUrl)
  expect(uiPreviewRequests).toHaveLength(1)

  await previewDialog
    .getByRole('button', { name: 'Close document preview' })
    .click()
  await expect(previewDialog).toBeHidden()
  await expect(previewButton).toBeFocused()

  const managementResponse = await context.request.get(
    new URL('/api/base-resumes', applicationUrl).toString(),
  )

  expect(managementResponse.status()).toBe(200)

  const managementBody = await managementResponse.text()

  expect(managementBody).not.toContain('/storage/v1/')
  expect(managementBody).not.toContain('storageObjectKey')
  expect(managementBody).not.toContain('storage_object_key')

  const configuration = requireLocalSupabaseConfiguration()
  const publicPdfResponse = await context.request.get(
    new URL(
      `/storage/v1/object/public/${bucketName}/${objectKey}`,
      configuration.url,
    ).toString(),
  )

  expect(publicPdfResponse.ok()).toBe(false)

  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()

  try {
    const otherUser = await createAuthenticatedTestUser(otherContext, otherPage)
    const crossOwnerResponse = await getBaseResumePreview(
      otherContext,
      uploaded.id,
    )

    await expectPreviewFailure(crossOwnerResponse, {
      code: 'base-resume-unavailable',
      status: 404,
    })

    const { data: crossOwnerSignedData, error: crossOwnerSignedError } =
      await otherUser.client.storage
        .from(bucketName)
        .createSignedUrl(objectKey, BASE_RESUME_PREVIEW_ACCESS_LIFETIME_SECONDS)

    expect(crossOwnerSignedData).toBeNull()
    expect(crossOwnerSignedError).not.toBeNull()
  } finally {
    await otherContext.close()
  }

  const retirementResponse = await context.request.post(
    new URL(
      `/api/base-resumes/${uploaded.id}/retire`,
      applicationUrl,
    ).toString(),
  )

  expect(retirementResponse.status()).toBe(200)

  const retiredPreviewResponse = await getBaseResumePreview(
    context,
    uploaded.id,
  )

  await expectPreviewFailure(retiredPreviewResponse, {
    code: 'base-resume-unavailable',
    status: 404,
  })
})
