import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import { expect, type BrowserContext, test } from '@playwright/test'

import type { Database } from '../../server/infrastructure/supabase/database.generated'

const applicationUrl =
  process.env.AUTH_INTEGRATION_APPLICATION_URL ?? 'http://127.0.0.1:3000'
const mailpitUrl =
  process.env.AUTH_INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const bucketName = 'base-resumes'
const maximumFileSize = 10 * 1024 * 1024
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
    email: `owl25-${identifier}@example.test`,
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

const createPdfBody = (label: string): Uint8Array =>
  new TextEncoder().encode(`%PDF-1.4\n% ResumAI ${label}\n%%EOF`)

const createObjectKey = (userId: string, resumeId: string): string =>
  `${userId}/${resumeId}.pdf`

const expectDownloadText = async (
  client: SupabaseClient<Database>,
  objectKey: string,
  expectedText: string,
): Promise<void> => {
  const { data, error } = await client.storage
    .from(bucketName)
    .download(objectKey)

  expect(error).toBeNull()
  expect(data).not.toBeNull()

  if (!data) {
    throw new Error('The expected Storage object could not be downloaded.')
  }

  await expect(data.text()).resolves.toBe(expectedText)
}

test('keeps base-resume objects private, owner-scoped, and immutable', async ({
  context,
}) => {
  const owner = await createAuthenticatedTestUser(context)
  const otherUser = await createAuthenticatedTestUser(context)
  const anonymousClient = createSupabaseClient()
  const resumeId = crypto.randomUUID()
  const objectKey = createObjectKey(owner.user.id, resumeId)
  const originalBody = createPdfBody('original')
  const replacementBody = createPdfBody('replacement')

  const { data: uploadData, error: uploadError } = await owner.client.storage
    .from(bucketName)
    .upload(objectKey, originalBody, {
      contentType: 'application/pdf',
      upsert: false,
    })

  expect(uploadError).toBeNull()
  expect(uploadData?.path).toBe(objectKey)
  await expectDownloadText(
    owner.client,
    objectKey,
    new TextDecoder().decode(originalBody),
  )

  const { data: otherUserDownload, error: otherUserDownloadError } =
    await otherUser.client.storage.from(bucketName).download(objectKey)

  expect(otherUserDownload).toBeNull()
  expect(otherUserDownloadError).not.toBeNull()

  const { data: anonymousDownload, error: anonymousDownloadError } =
    await anonymousClient.storage.from(bucketName).download(objectKey)

  expect(anonymousDownload).toBeNull()
  expect(anonymousDownloadError).not.toBeNull()

  const anonymousUploadKey = createObjectKey(owner.user.id, crypto.randomUUID())
  const { data: anonymousUpload, error: anonymousUploadError } =
    await anonymousClient.storage
      .from(bucketName)
      .upload(anonymousUploadKey, originalBody, {
        contentType: 'application/pdf',
        upsert: false,
      })

  expect(anonymousUpload).toBeNull()
  expect(anonymousUploadError).not.toBeNull()

  const otherNamespaceKey = createObjectKey(
    otherUser.user.id,
    crypto.randomUUID(),
  )
  const { data: crossOwnerUpload, error: crossOwnerUploadError } =
    await owner.client.storage
      .from(bucketName)
      .upload(otherNamespaceKey, originalBody, {
        contentType: 'application/pdf',
        upsert: false,
      })

  expect(crossOwnerUpload).toBeNull()
  expect(crossOwnerUploadError).not.toBeNull()

  const { data: overwriteData, error: overwriteError } =
    await owner.client.storage
      .from(bucketName)
      .upload(objectKey, replacementBody, {
        contentType: 'application/pdf',
        upsert: true,
      })

  expect(overwriteData).toBeNull()
  expect(overwriteError).not.toBeNull()
  await expectDownloadText(
    owner.client,
    objectKey,
    new TextDecoder().decode(originalBody),
  )
})

test('enforces the PDF, object-key, and 10 MiB bucket restrictions', async ({
  context,
}) => {
  const owner = await createAuthenticatedTestUser(context)
  const pdfBody = createPdfBody('restrictions')
  const wrongContentTypeKey = createObjectKey(
    owner.user.id,
    crypto.randomUUID(),
  )

  const { data: wrongContentTypeData, error: wrongContentTypeError } =
    await owner.client.storage
      .from(bucketName)
      .upload(wrongContentTypeKey, pdfBody, {
        contentType: 'text/plain',
        upsert: false,
      })

  expect(wrongContentTypeData).toBeNull()
  expect(wrongContentTypeError).not.toBeNull()

  const nestedObjectKey = `${owner.user.id}/nested/${crypto.randomUUID()}.pdf`
  const { data: nestedUploadData, error: nestedUploadError } =
    await owner.client.storage
      .from(bucketName)
      .upload(nestedObjectKey, pdfBody, {
        contentType: 'application/pdf',
        upsert: false,
      })

  expect(nestedUploadData).toBeNull()
  expect(nestedUploadError).not.toBeNull()

  const malformedObjectKey = `${owner.user.id}/not-a-resume-id.pdf`
  const { data: malformedUploadData, error: malformedUploadError } =
    await owner.client.storage
      .from(bucketName)
      .upload(malformedObjectKey, pdfBody, {
        contentType: 'application/pdf',
        upsert: false,
      })

  expect(malformedUploadData).toBeNull()
  expect(malformedUploadError).not.toBeNull()

  const oversizedBody = new Uint8Array(maximumFileSize + 1)
  oversizedBody.set(new TextEncoder().encode('%PDF-1.4\n'))
  const oversizedObjectKey = createObjectKey(owner.user.id, crypto.randomUUID())
  const { data: oversizedUploadData, error: oversizedUploadError } =
    await owner.client.storage
      .from(bucketName)
      .upload(oversizedObjectKey, oversizedBody, {
        contentType: 'application/pdf',
        upsert: false,
      })

  expect(oversizedUploadData).toBeNull()
  expect(oversizedUploadError).not.toBeNull()
})

test('allows cleanup only before a base-resume row tracks the object', async ({
  context,
}) => {
  const owner = await createAuthenticatedTestUser(context)
  const otherUser = await createAuthenticatedTestUser(context)
  const untrackedResumeId = crypto.randomUUID()
  const untrackedObjectKey = createObjectKey(owner.user.id, untrackedResumeId)
  const untrackedBody = createPdfBody('untracked')

  const { error: untrackedUploadError } = await owner.client.storage
    .from(bucketName)
    .upload(untrackedObjectKey, untrackedBody, {
      contentType: 'application/pdf',
      upsert: false,
    })

  expect(untrackedUploadError).toBeNull()

  const { data: otherUserCleanup, error: otherUserCleanupError } =
    await otherUser.client.storage.from(bucketName).remove([untrackedObjectKey])

  expect(otherUserCleanupError).toBeNull()
  expect(otherUserCleanup).toEqual([])
  await expectDownloadText(
    owner.client,
    untrackedObjectKey,
    new TextDecoder().decode(untrackedBody),
  )

  const { error: cleanupError } = await owner.client.storage
    .from(bucketName)
    .remove([untrackedObjectKey])

  expect(cleanupError).toBeNull()

  const { data: deletedObject, error: deletedObjectError } =
    await owner.client.storage.from(bucketName).download(untrackedObjectKey)

  expect(deletedObject).toBeNull()
  expect(deletedObjectError).not.toBeNull()

  const trackedResumeId = crypto.randomUUID()
  const trackedObjectKey = createObjectKey(owner.user.id, trackedResumeId)
  const trackedBody = createPdfBody('tracked')

  const { error: trackedUploadError } = await owner.client.storage
    .from(bucketName)
    .upload(trackedObjectKey, trackedBody, {
      contentType: 'application/pdf',
      upsert: false,
    })

  expect(trackedUploadError).toBeNull()

  const { error: baseResumeError } = await owner.client
    .from('base_resumes')
    .insert({
      active_slot: 1,
      content_sha256: 'a'.repeat(64),
      id: trackedResumeId,
      original_filename: 'tracked.pdf',
      size_bytes: trackedBody.byteLength,
      storage_object_key: trackedObjectKey,
      user_id: owner.user.id,
    })

  expect(baseResumeError).toBeNull()

  const { data: trackedCleanup, error: trackedCleanupError } =
    await owner.client.storage.from(bucketName).remove([trackedObjectKey])

  expect(trackedCleanupError).toBeNull()
  expect(trackedCleanup).toEqual([])
  await expectDownloadText(
    owner.client,
    trackedObjectKey,
    new TextDecoder().decode(trackedBody),
  )

  const { error: retirementError } = await owner.client
    .from('base_resumes')
    .update({
      active_slot: null,
      retired_at: new Date().toISOString(),
    })
    .eq('id', trackedResumeId)

  expect(retirementError).toBeNull()

  const { data: retiredCleanup, error: retiredCleanupError } =
    await owner.client.storage.from(bucketName).remove([trackedObjectKey])

  expect(retiredCleanupError).toBeNull()
  expect(retiredCleanup).toEqual([])
  await expectDownloadText(
    owner.client,
    trackedObjectKey,
    new TextDecoder().decode(trackedBody),
  )
})
