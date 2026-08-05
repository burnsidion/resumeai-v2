import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import {
  BASE_RESUME_BUCKET_NAME,
  BaseResumeStorageError,
  createBaseResumeStorage,
} from '../../server/infrastructure/supabase/base-resume-storage'
import type { Database } from '../../server/infrastructure/supabase/database.generated'

const objectKey =
  '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0/5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4.pdf'
const providerMessage = 'Sensitive Storage provider details'

interface FakeSupabaseClient {
  client: SupabaseClient<Database>
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })

const storageErrorResponse = (status = 503): Response =>
  jsonResponse(
    {
      error: 'storage_unavailable',
      message: providerMessage,
      statusCode: status.toString(),
    },
    status,
  )

const createFakeClient = (
  ...responses: ReadonlyArray<Response>
): FakeSupabaseClient => {
  const fetchMock = vi.fn<typeof fetch>()

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response)
  }

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

const getRequest = (
  fetchMock: FakeSupabaseClient['fetchMock'],
  index = 0,
): { init: RequestInit | undefined; url: URL } => {
  const [input, init] = fetchMock.mock.calls[index] ?? []

  if (!input) {
    throw new Error(`No Supabase request was recorded at index ${index}.`)
  }

  const url =
    input instanceof Request
      ? new URL(input.url)
      : new URL(input instanceof URL ? input : input.toString())

  return { init, url }
}

const expectSanitizedStorageFailure = async (
  action: () => Promise<unknown>,
  operation: BaseResumeStorageError['operation'],
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumeStorageError)
    expect(error).toMatchObject({
      code: 'base-resume-storage-unavailable',
      message: 'Base resume storage is temporarily unavailable.',
      operation,
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume Storage adapter to fail.')
}

describe('base-resume Storage adapter', () => {
  it('uploads exact bytes immutably with explicit PDF metadata', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse({
        Id: 'storage-object-id',
        Key: `${BASE_RESUME_BUCKET_NAME}/${objectKey}`,
      }),
    )
    const storage = createBaseResumeStorage(client)
    const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF')

    await expect(
      storage.uploadImmutableObject({ bytes, objectKey }),
    ).resolves.toBeUndefined()

    const request = getRequest(fetchMock)
    const headers = new Headers(request.init?.headers)

    expect(request.init?.method).toBe('POST')
    expect(request.url.pathname).toBe(
      `/storage/v1/object/${BASE_RESUME_BUCKET_NAME}/${objectKey}`,
    )
    expect(headers.get('content-type')).toBe('application/pdf')
    expect(headers.get('x-upsert')).toBe('false')
    expect(request.init?.body).toBe(bytes)
  })

  it('reports whether cleanup removed exactly one untracked object', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse([{ name: objectKey }]),
      jsonResponse([]),
    )
    const storage = createBaseResumeStorage(client)

    await expect(storage.removeUntrackedObject(objectKey)).resolves.toBe(
      'removed',
    )
    await expect(storage.removeUntrackedObject(objectKey)).resolves.toBe(
      'not-removed',
    )

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('DELETE')
    expect(request.url.pathname).toBe(
      `/storage/v1/object/${BASE_RESUME_BUCKET_NAME}`,
    )
    expect(JSON.parse(request.init?.body as string)).toEqual({
      prefixes: [objectKey],
    })
  })

  it('checks the exact object without listing the owner namespace', async () => {
    const { client, fetchMock } = createFakeClient(
      new Response(null, { status: 200 }),
    )
    const storage = createBaseResumeStorage(client)

    await expect(storage.objectExists(objectKey)).resolves.toBe(true)

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('HEAD')
    expect(request.url.pathname).toBe(
      `/storage/v1/object/${BASE_RESUME_BUCKET_NAME}/${objectKey}`,
    )
  })

  it('treats the pinned client missing-object result as absence', async () => {
    const { client } = createFakeClient(storageErrorResponse(404))
    const storage = createBaseResumeStorage(client)

    await expect(storage.objectExists(objectKey)).resolves.toBe(false)
  })

  it('sanitizes Storage provider failures', async () => {
    const { client } = createFakeClient(storageErrorResponse())
    const storage = createBaseResumeStorage(client)

    await expectSanitizedStorageFailure(
      () =>
        storage.uploadImmutableObject({
          bytes: new TextEncoder().encode('%PDF-1.7\n%%EOF'),
          objectKey,
        }),
      'upload-immutable-object',
    )
  })

  it('rejects an impossible multi-object cleanup result', async () => {
    const { client } = createFakeClient(
      jsonResponse([{ name: objectKey }, { name: 'unexpected.pdf' }]),
    )
    const storage = createBaseResumeStorage(client)

    await expectSanitizedStorageFailure(
      () => storage.removeUntrackedObject(objectKey),
      'remove-untracked-object',
    )
  })
})
