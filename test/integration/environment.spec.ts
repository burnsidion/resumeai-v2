import { expect, test } from '@playwright/test'

const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL

test('boots the isolated authentication test environment', async ({
  page,
  request,
}) => {
  if (!supabaseUrl) {
    throw new Error('The local Supabase URL is required.')
  }

  const [supabaseHealth, mailpitHealth] = await Promise.all([
    request.get(`${supabaseUrl}/auth/v1/health`),
    request.get(mailpitUrl),
  ])

  expect(supabaseHealth.ok()).toBe(true)
  expect(mailpitHealth.ok()).toBe(true)

  await page.goto('/')

  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(
    page.getByRole('heading', { name: 'Sign in to ResumAI' }),
  ).toBeVisible()
})
