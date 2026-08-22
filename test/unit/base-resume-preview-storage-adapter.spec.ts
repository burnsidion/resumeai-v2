import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import {
  BaseResumePreviewStorageError,
  createBaseResumePreviewStorage,
} from '../../server/infrastructure/supabase/base-resume-preview-storage'
import { BASE_RESUME_BUCKET_NAME } from '../../server/infrastructure/supabase/base-resume-storage'
import type { Database } from '../../server/infrastructure/supabase/database.generated'

const objectKey =
  '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0/5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4.pdf'
const signedPath = `/object/sign/${BASE_RESUME_BUCKET_NAME}/${objectKey}?token=test-token`
const providerMessage = 'Sensitive Storage provider details'

interface FakeSupabaseClient {
  client: SupabaseClient<Database>
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })

const createFakeClient = (response: Response): FakeSupabaseClient => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)

  return {
    client: createClient<Database>(
      'https://example.supabase.co',
      'sb_publishable_test-key',
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: { fetch: fetchMock },
      },
    ),
    fetchMock,
  }
}

const expectSanitizedFailure = async (
  action: () => Promise<unknown>,
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumePreviewStorageError)
    expect(error).toMatchObject({
      code: 'base-resume-preview-unavailable',
      message: 'Base resume preview storage is temporarily unavailable.',
      operation: 'create-signed-preview-url',
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected base-resume preview Storage to fail.')
}

describe('base-resume preview Storage adapter', () => {
  it('creates temporary access for the exact private object', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse({ signedURL: signedPath }),
    )
    const storage = createBaseResumePreviewStorage(client)

    await expect(storage.createSignedPreviewUrl(objectKey, 300)).resolves.toBe(
      `https://example.supabase.co/storage/v1${signedPath}`,
    )

    const [input, init] = fetchMock.mock.calls[0] ?? []

    if (!input) {
      throw new Error('No Storage request was recorded.')
    }

    const url = new URL(
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input
          : input.toString(),
    )

    expect(init?.method).toBe('POST')
    expect(url.pathname).toBe(
      `/storage/v1/object/sign/${BASE_RESUME_BUCKET_NAME}/${objectKey}`,
    )
    expect(JSON.parse(init?.body as string)).toEqual({ expiresIn: 300 })
  })

  it('sanitizes signed-access provider failures', async () => {
    const { client } = createFakeClient(
      jsonResponse(
        {
          error: 'storage_unavailable',
          message: providerMessage,
          statusCode: '503',
        },
        503,
      ),
    )
    const storage = createBaseResumePreviewStorage(client)

    await expectSanitizedFailure(() =>
      storage.createSignedPreviewUrl(objectKey, 300),
    )
  })
})
