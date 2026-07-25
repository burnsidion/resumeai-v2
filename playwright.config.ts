import { defineConfig, devices } from '@playwright/test'

const defaultApplicationUrl = 'http://127.0.0.1:3000'
const defaultMailpitUrl = 'http://127.0.0.1:54324'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? defaultApplicationUrl
const mailpitUrl = process.env.AUTH_INTEGRATION_MAILPIT_URL ?? defaultMailpitUrl
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const requireLoopbackUrl = (name: string, value: string): URL => {
  const url = new URL(value)
  const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

  if (!loopbackHosts.has(url.hostname)) {
    throw new Error(`${name} must use a loopback hostname.`)
  }

  if (url.protocol !== 'http:') {
    throw new Error(`${name} must use HTTP in the isolated local environment.`)
  }

  return url
}

requireLoopbackUrl('AUTH_INTEGRATION_APPLICATION_URL', applicationUrl)
requireLoopbackUrl('AUTH_INTEGRATION_MAILPIT_URL', mailpitUrl)

if (!supabaseUrl) {
  throw new Error('NUXT_PUBLIC_SUPABASE_URL is required for integration tests.')
}

requireLoopbackUrl('NUXT_PUBLIC_SUPABASE_URL', supabaseUrl)

if (!supabasePublishableKey?.startsWith('sb_publishable_')) {
  throw new Error(
    'NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a local publishable key.',
  )
}

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: process.env.CI ? 'line' : 'list',
  retries: 0,
  testDir: './test/integration',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: applicationUrl,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 3000',
    env: {
      NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
      NUXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    },
    reuseExistingServer: false,
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 120_000,
    url: applicationUrl,
  },
  workers: 1,
})
