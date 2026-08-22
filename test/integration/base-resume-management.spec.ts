import { createClient } from '@supabase/supabase-js'
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  test,
} from '@playwright/test'

import type { Database } from '../../server/infrastructure/supabase/database.generated'

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

const createDisposableCredentials = (): DisposableCredentials => {
  const identifier = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`

  return {
    email: `owl34-${identifier}@example.test`,
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

const authenticateDisposableUser = async (
  context: BrowserContext,
  page: Page,
): Promise<void> => {
  const configuration = requireLocalSupabaseConfiguration()
  const client = createClient<Database>(
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
}

const createPdfBody = (label: string): Buffer =>
  Buffer.from(`%PDF-1.7\n% ResumAI ${label}\n%%EOF`)

const openUploadDialog = async (
  page: Page,
  actionName: 'Choose a PDF' | 'Upload base resume',
): Promise<Locator> => {
  await page.getByRole('button', { exact: true, name: actionName }).click()

  const dialog = page.getByRole('dialog', { name: 'Upload base resume' })

  await expect(dialog).toBeVisible()
  return dialog
}

const selectPdf = async (
  dialog: Locator,
  input: { body: Buffer; filename: string },
): Promise<void> => {
  await dialog.locator('input[type="file"]').setInputFiles({
    buffer: input.body,
    mimeType: 'application/pdf',
    name: input.filename,
  })
}

const completePdfUpload = async (
  page: Page,
  dialog: Locator,
  input: {
    expectedSlot: 1 | 2 | 3
    filename: string
  },
): Promise<void> => {
  await expect(dialog.getByText(input.filename)).toBeVisible()
  await dialog.getByRole('button', { name: 'Upload resume' }).click()
  await expect(dialog.getByText('Upload complete')).toBeVisible()
  await expect(
    dialog.getByText(`Saved as active resume slot ${input.expectedSlot}.`),
  ).toBeVisible()
  await expect(
    page.getByRole('article').filter({ hasText: input.filename }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
}

const uploadPdf = async (
  page: Page,
  input: {
    actionName?: 'Choose a PDF' | 'Upload base resume'
    body: Buffer
    expectedSlot: 1 | 2 | 3
    filename: string
  },
): Promise<void> => {
  const dialog = await openUploadDialog(
    page,
    input.actionName ?? 'Upload base resume',
  )

  await selectPdf(dialog, input)
  await completePdfUpload(page, dialog, input)
}

const navigateToBaseResumes = async (page: Page): Promise<void> => {
  await page
    .getByRole('complementary', {
      name: 'Authenticated application sidebar',
    })
    .getByRole('link', { name: 'Base resumes' })
    .click()

  await expect(page).toHaveURL(/\/base-resumes$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Base resumes' }),
  ).toBeVisible()
}

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1)
}

const expectMinimumTouchTarget = async (locator: Locator): Promise<void> => {
  const dimensions = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()

    return { height: bounds.height, width: bounds.width }
  })

  expect(dimensions.height).toBeGreaterThanOrEqual(44)
  expect(dimensions.width).toBeGreaterThanOrEqual(44)
}

test('completes the active base-resume management lifecycle through the browser', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await authenticateDisposableUser(context, page)
  await navigateToBaseResumes(page)

  await expect(page.getByText('0 of 3 resumes')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Add your first base resume' }),
  ).toBeVisible()

  const uploadRequests: string[] = []

  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/base-resumes'
    ) {
      uploadRequests.push(request.url())
    }
  })

  const firstResume = {
    body: createPdfBody('management-first'),
    filename: 'Frontend Engineering.pdf',
  }
  const firstUploadDialog = await openUploadDialog(page, 'Choose a PDF')

  await selectPdf(firstUploadDialog, {
    body: Buffer.from('This is not a PDF.'),
    filename: 'Invalid Resume.pdf',
  })
  await expect(firstUploadDialog.getByRole('alert')).toContainText(
    'This file does not appear to be a valid PDF.',
  )
  expect(uploadRequests).toHaveLength(0)

  await selectPdf(firstUploadDialog, firstResume)
  await completePdfUpload(page, firstUploadDialog, {
    expectedSlot: 1,
    filename: firstResume.filename,
  })
  expect(uploadRequests).toHaveLength(1)
  await expect(page.getByText('1 of 3 resumes')).toBeVisible()

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText(firstResume.filename)).toBeVisible()
  await expect(page.getByText('1 of 3 resumes')).toBeVisible()

  const secondResume = {
    body: createPdfBody('management-second'),
    filename: 'Accessibility Engineering.pdf',
  }
  const thirdResume = {
    body: createPdfBody('management-third'),
    filename: 'Product Engineering.pdf',
  }

  await uploadPdf(page, { ...secondResume, expectedSlot: 2 })
  await uploadPdf(page, { ...thirdResume, expectedSlot: 3 })

  await expect(page.getByText('3 of 3 resumes')).toBeVisible()
  await expect(page.getByText('All active slots are in use')).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('button', { name: /upload/i }),
  ).toHaveCount(0)

  const secondResumeCard = page
    .getByRole('article')
    .filter({ hasText: secondResume.filename })

  await secondResumeCard
    .getByRole('button', { name: `Retire ${secondResume.filename}` })
    .click()

  const retirementDialog = page.getByRole('dialog', {
    name: 'Retire this base resume?',
  })

  await expect(retirementDialog).toBeVisible()
  await expect(retirementDialog).toContainText(secondResume.filename)
  await expect(retirementDialog).toContainText('Slot 2 will become available')

  const retirementEndpoint = '**/api/base-resumes/*/retire'
  let interceptedRetirementRequests = 0

  await page.route(retirementEndpoint, async (route) => {
    interceptedRetirementRequests += 1
    await route.fulfill({
      body: JSON.stringify({
        data: { code: 'base-resume-retirement-unavailable' },
        statusCode: 503,
        statusMessage: 'Base resume retirement is temporarily unavailable.',
      }),
      contentType: 'application/json',
      status: 503,
    })
  })

  await retirementDialog.getByRole('button', { name: 'Retire resume' }).click()
  await expect(retirementDialog.getByRole('alert')).toContainText(
    'Resume retirement is temporarily unavailable. Try again.',
  )
  expect(interceptedRetirementRequests).toBe(1)

  await page.unroute(retirementEndpoint)
  await retirementDialog.getByRole('button', { name: 'Try again' }).click()
  await expect(retirementDialog).toBeHidden()
  await expect(page.getByText(secondResume.filename)).toHaveCount(0)
  await expect(page.getByText('2 of 3 resumes')).toBeVisible()
  await expect(
    page
      .getByRole('heading', { name: '2 of 3 resumes' })
      .locator('..')
      .getByText('One slot available'),
  ).toBeVisible()

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText(secondResume.filename)).toHaveCount(0)
  await expect(page.getByText('2 of 3 resumes')).toBeVisible()

  const replacementResume = {
    body: createPdfBody('management-replacement'),
    filename: 'Design Systems Engineering.pdf',
  }

  await uploadPdf(page, { ...replacementResume, expectedSlot: 2 })

  const replacementCard = page
    .getByRole('article')
    .filter({ hasText: replacementResume.filename })

  await expect(replacementCard.getByText('Slot 2')).toBeVisible()
  await expect(page.getByText('3 of 3 resumes')).toBeVisible()

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText(firstResume.filename)).toBeVisible()
  await expect(page.getByText(thirdResume.filename)).toBeVisible()
  await expect(page.getByText(replacementResume.filename)).toBeVisible()
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: replacementResume.filename })
      .getByText('Slot 2'),
  ).toBeVisible()
  await expect(page.getByText('3 of 3 resumes')).toBeVisible()
  await expect(
    page.getByRole('complementary', {
      name: 'Authenticated application sidebar',
    }),
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(3)
  await expectNoHorizontalOverflow(page)
})

test('preserves accessible dialog behavior and reduced motion in the real upload flow', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await authenticateDisposableUser(context, page)
  await navigateToBaseResumes(page)

  const uploadAction = page.getByRole('button', {
    exact: true,
    name: 'Choose a PDF',
  })

  await uploadAction.click()

  let dialog = page.getByRole('dialog', { name: 'Upload base resume' })

  await expect(dialog).toBeFocused()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  const labelledBy = await dialog.getAttribute('aria-labelledby')
  const describedBy = await dialog.getAttribute('aria-describedby')

  expect(labelledBy).toBeTruthy()
  expect(describedBy).toBeTruthy()
  await expect(page.locator(`#${labelledBy}`)).toHaveText('Upload base resume')
  await expect(page.locator(`#${describedBy}`)).toContainText(
    'Add an existing PDF as a source document.',
  )

  await page.keyboard.press('Tab')
  const closeButton = dialog.getByRole('button', {
    name: 'Close upload dialog',
  })

  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Browse PDF' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(uploadAction).toBeFocused()

  await uploadAction.click()
  dialog = page.getByRole('dialog', { name: 'Upload base resume' })

  const filename = 'Reduced Motion Engineering.pdf'

  await selectPdf(dialog, {
    body: createPdfBody('reduced-motion'),
    filename,
  })

  const uploadEndpoint = '**/api/base-resumes'
  let continueUpload: (() => void) | undefined

  await page.route(uploadEndpoint, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await new Promise<void>((resolve) => {
      continueUpload = resolve
    })
    await route.continue()
  })

  await dialog.getByRole('button', { name: 'Upload resume' }).click()
  const uploadStatus = dialog.getByRole('status')

  await expect(uploadStatus).toContainText('Uploading and securing your resume')
  await expect(dialog).toHaveAttribute('aria-busy', 'true')
  await expect
    .poll(() => Boolean(continueUpload), {
      message: 'waiting for the intercepted upload request',
    })
    .toBe(true)

  const spinnerIterationCount = await uploadStatus
    .locator('.auth-spinner')
    .evaluate((element) => getComputedStyle(element).animationIterationCount)

  expect(spinnerIterationCount).toBe('1')
  continueUpload?.()

  await expect(dialog.getByRole('status')).toContainText('Upload complete')
  await expect(dialog).not.toHaveAttribute('aria-busy')
  await expect(
    page.getByRole('article').filter({ hasText: filename }),
  ).toBeVisible()
  await page.unroute(uploadEndpoint)

  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Base resumes' }),
  ).toBeFocused()
})

test('keeps the management surface usable across authenticated shell breakpoints', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await authenticateDisposableUser(context, page)
  await navigateToBaseResumes(page)

  const filename = 'Platform Engineering.pdf'

  await uploadPdf(page, {
    actionName: 'Choose a PDF',
    body: createPdfBody('base-resumes-mobile-navigation'),
    expectedSlot: 1,
    filename,
  })

  await page.reload({ waitUntil: 'networkidle' })
  await expect(
    page.getByRole('complementary', {
      name: 'Authenticated application sidebar',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('complementary', {
      name: 'Collapsed authenticated navigation',
    }),
  ).toBeHidden()
  await expectNoHorizontalOverflow(page)

  await page.setViewportSize({ height: 900, width: 1024 })

  const collapsedNavigation = page.getByRole('complementary', {
    name: 'Collapsed authenticated navigation',
  })

  await expect(
    page.getByRole('complementary', {
      name: 'Authenticated application sidebar',
    }),
  ).toBeHidden()
  await expect(collapsedNavigation).toBeVisible()
  await expect(
    collapsedNavigation.getByRole('link', { name: 'Base resumes' }),
  ).toHaveAttribute('aria-current', 'page')
  await expectNoHorizontalOverflow(page)

  const tabletUploadAction = page.getByRole('button', {
    exact: true,
    name: 'Upload base resume',
  })
  const tabletResumeCard = page.getByRole('article').filter({
    hasText: filename,
  })
  const tabletAvailableSlot = page.getByRole('button', {
    name: /Upload another base resume/,
  })
  const tabletResumeBounds = await tabletResumeCard.boundingBox()
  const tabletAvailableSlotBounds = await tabletAvailableSlot.boundingBox()

  expect(tabletResumeBounds).not.toBeNull()
  expect(tabletAvailableSlotBounds).not.toBeNull()
  expect(
    Math.abs(
      (tabletResumeBounds?.y ?? 0) - (tabletAvailableSlotBounds?.y ?? 0),
    ),
  ).toBeLessThanOrEqual(1)
  await expectMinimumTouchTarget(tabletUploadAction)

  await tabletUploadAction.click()

  let uploadDialog = page.getByRole('dialog', { name: 'Upload base resume' })
  const tabletDialogBounds = await uploadDialog.boundingBox()

  expect(tabletDialogBounds).not.toBeNull()
  expect(tabletDialogBounds?.x ?? -1).toBeGreaterThanOrEqual(24)
  expect(
    (tabletDialogBounds?.x ?? 0) + (tabletDialogBounds?.width ?? 0),
  ).toBeLessThanOrEqual(1000)
  await uploadDialog
    .getByRole('button', { name: 'Close upload dialog' })
    .click()
  await expect(uploadDialog).toBeHidden()
  await expect(tabletUploadAction).toBeFocused()

  await page.setViewportSize({ height: 844, width: 390 })

  await expect(
    page.getByRole('complementary', {
      name: 'Authenticated application sidebar',
    }),
  ).toBeHidden()
  await expect(collapsedNavigation).toBeHidden()
  await expectNoHorizontalOverflow(page)

  const mobileResumeBounds = await tabletResumeCard.boundingBox()
  const mobileAvailableSlotBounds = await tabletAvailableSlot.boundingBox()

  expect(mobileResumeBounds).not.toBeNull()
  expect(mobileAvailableSlotBounds).not.toBeNull()
  expect(mobileAvailableSlotBounds?.y ?? 0).toBeGreaterThan(
    (mobileResumeBounds?.y ?? 0) + (mobileResumeBounds?.height ?? 0),
  )

  const mobileMenuButton = page.getByRole('button', {
    name: 'Open navigation',
  })

  await expectMinimumTouchTarget(mobileMenuButton)
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
  await expectNoHorizontalOverflow(page)

  const mobileUploadAction = page.getByRole('button', {
    exact: true,
    name: 'Upload base resume',
  })

  await mobileUploadAction.click()
  uploadDialog = page.getByRole('dialog', { name: 'Upload base resume' })

  const mobileDialogBounds = await uploadDialog.boundingBox()

  expect(mobileDialogBounds).not.toBeNull()
  expect(mobileDialogBounds?.x ?? -1).toBeGreaterThanOrEqual(16)
  expect(
    (mobileDialogBounds?.x ?? 0) + (mobileDialogBounds?.width ?? 0),
  ).toBeLessThanOrEqual(374)
  await expectMinimumTouchTarget(
    uploadDialog.getByRole('button', { name: 'Close upload dialog' }),
  )
  await uploadDialog
    .getByRole('button', { name: 'Close upload dialog' })
    .click()
  await expect(uploadDialog).toBeHidden()
  await expect(mobileUploadAction).toBeFocused()

  const mobilePreviewAction = page.getByRole('button', {
    name: `Preview ${filename}`,
  })

  await expectMinimumTouchTarget(mobilePreviewAction)
  await mobilePreviewAction.click()

  const mobilePreviewDialog = page.getByRole('dialog', { name: filename })
  const mobilePreviewBounds = await mobilePreviewDialog.boundingBox()

  expect(mobilePreviewBounds).not.toBeNull()
  expect(mobilePreviewBounds?.x).toBe(0)
  expect(mobilePreviewBounds?.y).toBe(0)
  expect(mobilePreviewBounds?.width).toBe(390)
  expect(mobilePreviewBounds?.height).toBe(844)
  await expect(
    mobilePreviewDialog.locator(`iframe[title="Preview of ${filename}"]`),
  ).toBeVisible()
  await expect(
    mobilePreviewDialog.getByRole('link', { name: 'Open' }),
  ).toBeVisible()
  await expectMinimumTouchTarget(
    mobilePreviewDialog.getByRole('button', {
      name: 'Close document preview',
    }),
  )
  await expectNoHorizontalOverflow(page)

  await mobilePreviewDialog
    .getByRole('button', { name: 'Close document preview' })
    .click()
  await expect(mobilePreviewDialog).toBeHidden()
  await expect(mobilePreviewAction).toBeFocused()
})
