import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import {
  expect,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
  test,
} from '@playwright/test'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
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
    email: `owl26-${identifier}@example.test`,
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

  await page.goto('/sign-in', { waitUntil: 'networkidle' })
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
    mimeType?: string
  },
): Promise<APIResponse> =>
  context.request.post(
    new URL('/api/base-resumes', applicationUrl).toString(),
    {
      multipart: {
        file: {
          buffer: input.body,
          mimeType: input.mimeType ?? 'application/pdf',
          name: input.filename,
        },
      },
    },
  )

const calculateSha256 = async (bytes: Buffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

const expectStoredPdf = async (
  client: SupabaseClient<Database>,
  objectKey: string,
  expectedBody: Buffer,
): Promise<void> => {
  const { data, error } = await client.storage
    .from(bucketName)
    .download(objectKey)

  expect(error).toBeNull()
  expect(data).not.toBeNull()

  if (!data) {
    throw new Error('The expected base-resume object was not available.')
  }

  const downloadedBody = Buffer.from(await data.arrayBuffer())

  expect(downloadedBody).toEqual(expectedBody)
}

const expectUploadFailure = async (
  response: APIResponse,
  expected: {
    code: string
    status: number
  },
): Promise<void> => {
  expect(response.status()).toBe(expected.status)
  await expect(response.json()).resolves.toMatchObject({
    data: {
      code: expected.code,
    },
  })
}

const getDashboardSection = (page: Page, name: string): Locator =>
  page.getByRole('region', { name })

const openUploadDialog = async (page: Page): Promise<Locator> => {
  const uploadAction = getDashboardSection(page, 'Quick actions').getByRole(
    'button',
    { name: /Upload base resume/ },
  )

  await expect(uploadAction).toBeEnabled()
  await uploadAction.click()

  const dialog = page.getByRole('dialog', { name: 'Upload base resume' })

  await expect(dialog).toBeVisible()
  return dialog
}

const openBaseResumesPageUploadDialog = async (
  page: Page,
): Promise<Locator> => {
  const uploadAction = page.getByRole('button', { name: 'Choose a PDF' })

  await expect(uploadAction).toBeEnabled()
  await uploadAction.click()

  const dialog = page.getByRole('dialog', { name: 'Upload base resume' })

  await expect(dialog).toBeVisible()
  return dialog
}

const selectPdfInDialog = async (
  dialog: Locator,
  input: {
    body: Buffer
    filename: string
  },
): Promise<void> => {
  await dialog.locator('input[type="file"]').setInputFiles({
    buffer: input.body,
    mimeType: 'application/pdf',
    name: input.filename,
  })
}

const uploadPdfThroughDashboard = async (
  page: Page,
  input: {
    body: Buffer
    filename: string
  },
): Promise<void> => {
  const dialog = await openUploadDialog(page)

  await selectPdfInDialog(dialog, input)
  await expect(dialog.getByText(input.filename)).toBeVisible()
  await dialog.getByRole('button', { name: 'Upload resume' }).click()
  await expect(dialog.getByText('Upload complete')).toBeVisible()
  await expect(dialog.getByText(input.filename)).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
}

test('persists one exact row and immutable private object for a valid authenticated upload', async ({
  context,
  page,
}) => {
  const owner = await createAuthenticatedTestUser(context, page)
  const filename = 'Frontend Engineer.pdf'
  const pdfBody = createPdfBody('exact-success')
  const response = await uploadBaseResume(context, {
    body: pdfBody,
    filename,
  })

  expect(response.status()).toBe(201)

  const payload = uploadBaseResumeResponseSchema.parse(await response.json())
  const objectKey = `${owner.user.id}/${payload.baseResume.id}.pdf`
  const expectedHash = await calculateSha256(pdfBody)
  const { data: rows, error: rowError } = await owner.client
    .from('base_resumes')
    .select(
      'id,user_id,original_filename,storage_object_key,content_type,size_bytes,content_sha256,active_slot,retired_at',
    )
    .eq('user_id', owner.user.id)

  expect(rowError).toBeNull()
  expect(rows).toEqual([
    {
      active_slot: 1,
      content_sha256: expectedHash,
      content_type: 'application/pdf',
      id: payload.baseResume.id,
      original_filename: filename,
      retired_at: null,
      size_bytes: pdfBody.byteLength,
      storage_object_key: objectKey,
      user_id: owner.user.id,
    },
  ])
  expect(payload.baseResume).toMatchObject({
    activeSlot: 1,
    originalFilename: filename,
  })

  const { data: objects, error: objectListError } = await owner.client.storage
    .from(bucketName)
    .list(owner.user.id)

  expect(objectListError).toBeNull()
  expect(objects?.map(({ name }) => name)).toEqual([
    `${payload.baseResume.id}.pdf`,
  ])
  await expectStoredPdf(owner.client, objectKey, pdfBody)

  const replacementBody = createPdfBody('replacement-attempt')
  const { data: overwriteData, error: overwriteError } =
    await owner.client.storage
      .from(bucketName)
      .upload(objectKey, replacementBody, {
        contentType: 'application/pdf',
        upsert: true,
      })

  expect(overwriteData).toBeNull()
  expect(overwriteError).not.toBeNull()
  await expectStoredPdf(owner.client, objectKey, pdfBody)
})

test('rejects unauthenticated and invalid uploads without persistent changes', async ({
  context,
  page,
}) => {
  const unauthenticatedResponse = await uploadBaseResume(context, {
    body: createPdfBody('unauthenticated'),
    filename: 'Unauthenticated.pdf',
  })

  await expectUploadFailure(unauthenticatedResponse, {
    code: 'authentication-required',
    status: 401,
  })

  const owner = await createAuthenticatedTestUser(context, page)
  const wrongTypeResponse = await uploadBaseResume(context, {
    body: createPdfBody('wrong-type'),
    filename: 'Wrong Type.pdf',
    mimeType: 'text/plain',
  })
  const invalidPdfResponse = await uploadBaseResume(context, {
    body: Buffer.from('This is not a PDF.'),
    filename: 'Invalid.pdf',
  })

  await expectUploadFailure(wrongTypeResponse, {
    code: 'unsupported-file-type',
    status: 415,
  })
  await expectUploadFailure(invalidPdfResponse, {
    code: 'invalid-pdf',
    status: 422,
  })

  const { data: rows, error: rowError } = await owner.client
    .from('base_resumes')
    .select('id')
    .eq('user_id', owner.user.id)
  const { data: objects, error: objectListError } = await owner.client.storage
    .from(bucketName)
    .list(owner.user.id)

  expect(rowError).toBeNull()
  expect(rows).toEqual([])
  expect(objectListError).toBeNull()
  expect(objects).toEqual([])
})

test('keeps three deterministic rows and objects under concurrent capacity pressure', async ({
  context,
  page,
}) => {
  const owner = await createAuthenticatedTestUser(context, page)

  for (const index of [1, 2]) {
    const response = await uploadBaseResume(context, {
      body: createPdfBody(`capacity-${index}`),
      filename: `Capacity ${index}.pdf`,
    })

    expect(response.status()).toBe(201)
  }

  const concurrentResponses = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      uploadBaseResume(context, {
        body: createPdfBody(`concurrent-${index}`),
        filename: `Concurrent ${index}.pdf`,
      }),
    ),
  )
  const successfulResponses = concurrentResponses.filter(
    (response) => response.status() === 201,
  )
  const rejectedResponses = concurrentResponses.filter(
    (response) => response.status() === 409,
  )

  expect(successfulResponses).toHaveLength(1)
  expect(rejectedResponses).toHaveLength(3)

  for (const response of rejectedResponses) {
    await expectUploadFailure(response, {
      code: 'active-resume-limit-reached',
      status: 409,
    })
  }

  const { data: rows, error: rowError } = await owner.client
    .from('base_resumes')
    .select('id,active_slot,storage_object_key')
    .eq('user_id', owner.user.id)
    .order('active_slot', { ascending: true })
  const { data: objects, error: objectListError } = await owner.client.storage
    .from(bucketName)
    .list(owner.user.id, { limit: 100 })

  expect(rowError).toBeNull()
  expect(rows?.map(({ active_slot }) => active_slot)).toEqual([1, 2, 3])
  expect(objectListError).toBeNull()
  expect(objects).toHaveLength(3)
  expect(new Set(objects?.map(({ name }) => name))).toEqual(
    new Set(
      rows?.map(({ storage_object_key }) =>
        storage_object_key.slice(storage_object_key.lastIndexOf('/') + 1),
      ),
    ),
  )
})

test('navigates to Base Resumes, uploads through the shared dialog, and supports mobile navigation', async ({
  context,
  page,
}) => {
  await createAuthenticatedTestUser(context, page)

  const desktopNavigation = page.getByRole('complementary', {
    name: 'Authenticated application sidebar',
  })

  await desktopNavigation.getByRole('link', { name: 'Base resumes' }).click()
  await expect(page).toHaveURL(/\/base-resumes$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Base resumes' }),
  ).toBeVisible()
  await expect(page.getByText('0 of 3 resumes')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Add your first base resume' }),
  ).toBeVisible()

  const filename = 'Platform Engineering.pdf'
  const dialog = await openBaseResumesPageUploadDialog(page)

  await selectPdfInDialog(dialog, {
    body: createPdfBody('base-resumes-page'),
    filename,
  })
  await dialog.getByRole('button', { name: 'Upload resume' }).click()
  await expect(dialog.getByText('Upload complete')).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('heading', { name: filename }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('1 of 3 resumes')).toBeVisible()

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText(filename)).toBeVisible()
  await expect(page.getByText('1 of 3 resumes')).toBeVisible()

  await page.setViewportSize({ height: 844, width: 390 })

  const mobileMenuButton = page.getByRole('button', {
    name: 'Open navigation',
  })

  await mobileMenuButton.click()

  let mobileNavigation = page.getByRole('dialog', { name: 'Navigation' })

  await expect(mobileNavigation).toBeVisible()
  await expect(
    mobileNavigation.getByRole('link', { name: 'Base resumes' }),
  ).toHaveAttribute('aria-current', 'page')

  await page.keyboard.press('Escape')
  await expect(mobileNavigation).toBeHidden()
  await expect(mobileMenuButton).toBeFocused()

  await mobileMenuButton.click()
  mobileNavigation = page.getByRole('dialog', { name: 'Navigation' })
  await mobileNavigation.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(mobileNavigation).toBeHidden()

  await mobileMenuButton.click()
  mobileNavigation = page.getByRole('dialog', { name: 'Navigation' })
  await mobileNavigation.getByRole('link', { name: 'Base resumes' }).click()
  await expect(page).toHaveURL(/\/base-resumes$/)
  await expect(mobileNavigation).toBeHidden()
  await expect(page.getByText(filename)).toBeVisible()
})

test('completes the accessible dashboard upload journey and preserves all three resumes after reload', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const owner = await createAuthenticatedTestUser(context, page)
  const uploadRequests: string[] = []

  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/base-resumes'
    ) {
      uploadRequests.push(request.url())
    }
  })

  await expect(
    getDashboardSection(page, 'Base resumes').getByText(
      'No base resumes have been added yet.',
    ),
  ).toBeVisible()

  const firstDialog = await openUploadDialog(page)

  await expect(firstDialog.getByText('PDF only')).toBeVisible()
  await expect(firstDialog.getByText('Maximum 10 MiB')).toBeVisible()
  await expect(
    firstDialog.getByText('0 of 3 active resumes · 3 slots remaining'),
  ).toBeVisible()
  await expect(
    firstDialog.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).resolves.toBe(true)

  await selectPdfInDialog(firstDialog, {
    body: Buffer.from('This is not a PDF.'),
    filename: 'Invalid Resume.pdf',
  })
  await expect(firstDialog.getByRole('alert')).toContainText(
    'This file does not appear to be a valid PDF.',
  )
  expect(uploadRequests).toHaveLength(0)

  const firstFilename = 'Frontend Engineering.pdf'

  await selectPdfInDialog(firstDialog, {
    body: createPdfBody('dashboard-first'),
    filename: firstFilename,
  })
  await firstDialog.getByRole('button', { name: 'Upload resume' }).click()
  await expect(firstDialog.getByText('Upload complete')).toBeVisible()
  await expect(
    firstDialog.getByText('Saved as active resume slot 1.'),
  ).toBeVisible()
  await expect(
    getDashboardSection(page, 'Base resumes').getByText(firstFilename),
  ).toBeVisible()
  expect(uploadRequests).toHaveLength(1)
  await firstDialog.getByRole('button', { name: 'Done' }).click()

  const remainingResumes = [
    {
      body: createPdfBody('dashboard-second'),
      filename: 'Accessibility Engineering.pdf',
    },
    {
      body: createPdfBody('dashboard-third'),
      filename: 'Product Engineering.pdf',
    },
  ]

  for (const resume of remainingResumes) {
    await uploadPdfThroughDashboard(page, resume)
  }

  const baseResumes = getDashboardSection(page, 'Base resumes')
  const quickActions = getDashboardSection(page, 'Quick actions')
  const uploadAction = quickActions.getByRole('button', {
    name: /Upload base resume/,
  })

  await expect(baseResumes.getByText('3 of 3 resumes')).toBeVisible()
  await expect(baseResumes.getByText('Slot 1')).toBeVisible()
  await expect(baseResumes.getByText('Slot 2')).toBeVisible()
  await expect(baseResumes.getByText('Slot 3')).toBeVisible()
  await expect(uploadAction).toBeDisabled()
  await expect(uploadAction).toContainText('All three resume slots are in use')
  await expect(
    baseResumes.getByRole('button', { name: /Upload base resume/ }),
  ).toHaveCount(0)
  expect(uploadRequests).toHaveLength(3)

  await page.reload({ waitUntil: 'networkidle' })

  for (const filename of [
    firstFilename,
    ...remainingResumes.map(({ filename }) => filename),
  ]) {
    await expect(
      getDashboardSection(page, 'Base resumes').getByText(filename),
    ).toBeVisible()
  }

  await page
    .getByRole('complementary', {
      name: 'Authenticated application sidebar',
    })
    .getByRole('link', { name: 'Base resumes' })
    .click()
  await expect(page).toHaveURL(/\/base-resumes$/)
  await expect(page.getByText('3 of 3 resumes')).toBeVisible()
  await expect(page.getByText('All active slots are in use')).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('button', { name: /upload/i }),
  ).toHaveCount(0)

  const { count, error } = await owner.client
    .from('base_resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', owner.user.id)

  expect(error).toBeNull()
  expect(count).toBe(3)
})
