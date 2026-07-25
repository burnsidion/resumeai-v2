import { expect, type BrowserContext, type Page, test } from '@playwright/test'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? 'http://127.0.0.1:3000'
const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

interface DisposableCredentials {
  email: string
  password: string
}

const createDisposableCredentials = (): DisposableCredentials => {
  const identifier = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`

  return {
    email: `owl14-${identifier}@example.test`,
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

const expectAuthenticatedSession = async (
  context: BrowserContext,
  email: string,
): Promise<void> => {
  const response = await context.request.get(
    new URL('/api/auth/session', applicationUrl).toString(),
  )

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({
    authenticated: true,
    user: {
      email,
    },
  })
}

const expectSignedOutSession = async (
  context: BrowserContext,
): Promise<void> => {
  const response = await context.request.get(
    new URL('/api/auth/session', applicationUrl).toString(),
  )

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toEqual({
    authenticated: false,
  })
}

const signOut = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
}

test('completes the disposable-user authentication journey', async ({
  context,
  page,
}) => {
  const credentials = createDisposableCredentials()

  await page.goto('/sign-up', { waitUntil: 'networkidle' })
  await page.getByLabel('Email address').fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page
    .getByRole('textbox', { name: 'Confirm password' })
    .fill(credentials.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/auth\/verify-email$/)
  await expect(page.getByText(credentials.email)).toBeVisible()

  const confirmationUrl = await getConfirmationUrl(context, credentials.email)

  await page.goto(confirmationUrl)
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
  await expect(page.getByText(credentials.email)).toBeVisible()
  await expectAuthenticatedSession(context, credentials.email)

  await signOut(page)

  await page.getByLabel('Email address').fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(credentials.email)).toBeVisible()
  await expectAuthenticatedSession(context, credentials.email)

  await page.reload()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(credentials.email)).toBeVisible()
  await expectAuthenticatedSession(context, credentials.email)

  await signOut(page)
  await expectSignedOutSession(context)

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/sign-in\?next=\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: 'Sign in to ResumAI' }),
  ).toBeVisible()
})
