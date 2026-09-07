import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  test,
} from '@playwright/test'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  applicationDetailResponseSchema,
  applicationListViewModelSchema,
} from '../../shared/applications/view-model'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? 'http://127.0.0.1:3000'
const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
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

const createDisposableCredentials = (label: string): DisposableCredentials => {
  const identifier = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`

  return {
    email: `owl39-${label}-${identifier}@example.test`,
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
  label: string,
): Promise<AuthenticatedTestUser> => {
  const client = createSupabaseClient()
  const credentials = createDisposableCredentials(label)
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

const createBaseResumeFixture = async (
  authenticatedUser: AuthenticatedTestUser,
  label: string,
  hashCharacter: string,
): Promise<string> => {
  const id = crypto.randomUUID()
  const { error } = await authenticatedUser.client.from('base_resumes').insert({
    active_slot: 1,
    content_sha256: hashCharacter.repeat(64),
    original_filename: `${label} Resume.pdf`,
    id,
    size_bytes: 1024,
    storage_object_key: `${authenticatedUser.user.id}/${id}.pdf`,
    user_id: authenticatedUser.user.id,
  })

  expect(error).toBeNull()

  return id
}

const applicationsUrl = new URL('/api/applications', applicationUrl).toString()

const applicationDetailUrl = (id: string): string =>
  new URL(`/api/applications/${id}`, applicationUrl).toString()

const createApplication = (
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<APIResponse> => request.post(applicationsUrl, { data })

const updateApplication = (
  request: APIRequestContext,
  id: string,
  data: Record<string, unknown>,
): Promise<APIResponse> => request.patch(applicationDetailUrl(id), { data })

const expectEndpointFailure = async (
  response: APIResponse,
  expected: { code: string; status: number },
): Promise<void> => {
  expect(response.status()).toBe(expected.status)
  await expect(response.json()).resolves.toMatchObject({
    data: { code: expected.code },
  })
}

test('manages only the authenticated owner applications through the Nuxt server', async ({
  browser,
  context,
  page,
}) => {
  await expectEndpointFailure(await context.request.get(applicationsUrl), {
    code: 'authentication-required',
    status: 401,
  })

  const ownerOne = await createAuthenticatedTestUser(context, page, 'owner-one')
  const ownerOneResumeId = await createBaseResumeFixture(
    ownerOne,
    'Owner One',
    'a',
  )
  const ownerTwoContext = await browser.newContext()
  const ownerTwoPage = await ownerTwoContext.newPage()

  try {
    const ownerTwo = await createAuthenticatedTestUser(
      ownerTwoContext,
      ownerTwoPage,
      'owner-two',
    )
    const ownerTwoResumeId = await createBaseResumeFixture(
      ownerTwo,
      'Owner Two',
      'b',
    )
    const ownerTwoCreateResponse = await createApplication(
      ownerTwoContext.request,
      {
        company: 'Owner Two Company',
        jobDescription: 'Build reliable systems.',
        role: 'Platform Engineer',
        selectedBaseResumeId: ownerTwoResumeId,
      },
    )

    expect(ownerTwoCreateResponse.status()).toBe(201)

    const ownerTwoApplication = applicationDetailResponseSchema.parse(
      await ownerTwoCreateResponse.json(),
    ).application
    const ownershipOverrideResponse = await createApplication(context.request, {
      company: 'Invalid Ownership Company',
      role: 'Engineer',
      user_id: ownerTwo.user.id,
    })

    await expectEndpointFailure(ownershipOverrideResponse, {
      code: 'invalid-application',
      status: 400,
    })

    const ownerOneCreateResponse = await createApplication(context.request, {
      company: '  Northstar Labs  ',
      role: '  Senior Frontend Engineer  ',
    })

    expect(ownerOneCreateResponse.status()).toBe(201)

    const ownerOneApplication = applicationDetailResponseSchema.parse(
      await ownerOneCreateResponse.json(),
    ).application

    expect(ownerOneApplication).toMatchObject({
      appliedOn: null,
      company: 'Northstar Labs',
      jobDescription: null,
      notes: null,
      postingUrl: null,
      readiness: {
        isReady: false,
        missingRequirements: [{ id: 'job-description' }, { id: 'base-resume' }],
      },
      role: 'Senior Frontend Engineer',
      selectedBaseResume: null,
      status: 'draft',
    })
    expect(ownerOneApplication.createdAt).toBe(ownerOneApplication.updatedAt)

    const ownerOneListResponse = await context.request.get(applicationsUrl)

    expect(ownerOneListResponse.status()).toBe(200)

    const ownerOneList = applicationListViewModelSchema.parse(
      await ownerOneListResponse.json(),
    )

    expect(ownerOneList.applications).toHaveLength(1)
    expect(ownerOneList.applications[0]).toMatchObject({
      company: 'Northstar Labs',
      id: ownerOneApplication.id,
      role: 'Senior Frontend Engineer',
      status: 'draft',
    })
    expect(ownerOneList.applications[0]).not.toHaveProperty('jobDescription')
    expect(ownerOneList.applications).not.toContainEqual(
      expect.objectContaining({ id: ownerTwoApplication.id }),
    )

    await expectEndpointFailure(
      await ownerTwoContext.request.get(
        applicationDetailUrl(ownerOneApplication.id),
      ),
      {
        code: 'application-unavailable',
        status: 404,
      },
    )
    await expectEndpointFailure(
      await updateApplication(ownerTwoContext.request, ownerOneApplication.id, {
        company: 'Cross-owner mutation',
      }),
      {
        code: 'application-unavailable',
        status: 404,
      },
    )

    await expectEndpointFailure(
      await updateApplication(context.request, ownerOneApplication.id, {
        jobDescription: 'This must not be saved on failure.',
        selectedBaseResumeId: ownerTwoResumeId,
      }),
      {
        code: 'selected-base-resume-unavailable',
        status: 409,
      },
    )

    const unchangedResponse = await context.request.get(
      applicationDetailUrl(ownerOneApplication.id),
    )
    const unchangedApplication = applicationDetailResponseSchema.parse(
      await unchangedResponse.json(),
    ).application

    expect(unchangedApplication).toMatchObject({
      company: 'Northstar Labs',
      jobDescription: null,
      selectedBaseResume: null,
      status: 'draft',
    })

    const ownerOneUpdateResponse = await updateApplication(
      context.request,
      ownerOneApplication.id,
      {
        appliedOn: '2026-09-06',
        company: '  Northstar Labs, Inc.  ',
        jobDescription: '  Build accessible product experiences.  ',
        selectedBaseResumeId: ownerOneResumeId,
        status: 'applied',
      },
    )

    expect(ownerOneUpdateResponse.status()).toBe(200)

    const updatedApplication = applicationDetailResponseSchema.parse(
      await ownerOneUpdateResponse.json(),
    ).application

    expect(updatedApplication).toMatchObject({
      appliedOn: '2026-09-06',
      company: 'Northstar Labs, Inc.',
      jobDescription: 'Build accessible product experiences.',
      readiness: {
        isReady: true,
        missingRequirements: [],
      },
      selectedBaseResume: {
        availabilityLabel: 'Active',
        id: ownerOneResumeId,
        isAvailable: true,
      },
      status: 'applied',
    })

    const ownerTwoListResponse =
      await ownerTwoContext.request.get(applicationsUrl)
    const ownerTwoList = applicationListViewModelSchema.parse(
      await ownerTwoListResponse.json(),
    )

    expect(ownerTwoList.applications.map(({ id }) => id)).toEqual([
      ownerTwoApplication.id,
    ])
  } finally {
    await ownerTwoContext.close()
  }
})
