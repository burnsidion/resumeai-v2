import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  BaseResumePreviewRepositoryError,
  createBaseResumePreviewRepository,
} from '../../server/repositories/base-resume-preview'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const objectKey = `${userId}/${baseResumeId}.pdf`
const providerMessage = 'Sensitive PostgREST provider details'

const sourceRow = {
  id: baseResumeId,
  original_filename: 'Frontend Engineer.pdf',
  storage_object_key: objectKey,
}

interface FakeSupabaseClient {
  client: SupabaseClient<Database>
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
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

const getRequest = (
  fetchMock: FakeSupabaseClient['fetchMock'],
): { init: RequestInit | undefined; url: URL } => {
  const [input, init] = fetchMock.mock.calls[0] ?? []

  if (!input) {
    throw new Error('No Supabase request was recorded.')
  }

  return {
    init,
    url: new URL(
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input
          : input.toString(),
    ),
  }
}

const expectSanitizedFailure = async (
  action: () => Promise<unknown>,
  kind: BaseResumePreviewRepositoryError['kind'],
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumePreviewRepositoryError)
    expect(error).toMatchObject({
      code: 'base-resume-preview-unavailable',
      kind,
      message: 'Base resume preview data is temporarily unavailable.',
      operation: 'find-active-base-resume-preview-source',
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume preview repository to fail.')
}

describe('base-resume preview repository', () => {
  it('returns the narrow owner-scoped active source', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(sourceRow))
    const repository = createBaseResumePreviewRepository({ client, userId })

    await expect(repository.findActiveById(baseResumeId)).resolves.toEqual({
      id: baseResumeId,
      originalFilename: 'Frontend Engineer.pdf',
      storageObjectKey: objectKey,
    })

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('GET')
    expect(request.url.pathname).toBe('/rest/v1/base_resumes')
    expect(request.url.searchParams.get('select')).toBe(
      'id,original_filename,storage_object_key',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${baseResumeId}`)
    expect(request.url.searchParams.get('active_slot')).toBe('not.is.null')
    expect(request.url.searchParams.get('retired_at')).toBe('is.null')
  })

  it('returns null for a missing, cross-owner, or retired row', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createBaseResumePreviewRepository({ client, userId })

    await expect(repository.findActiveById(baseResumeId)).resolves.toBeNull()
  })

  it('sanitizes provider failures', async () => {
    const { client } = createFakeClient(
      jsonResponse(
        {
          code: 'PGRST_TEST',
          details: providerMessage,
          hint: null,
          message: providerMessage,
        },
        503,
      ),
    )
    const repository = createBaseResumePreviewRepository({ client, userId })

    await expectSanitizedFailure(
      () => repository.findActiveById(baseResumeId),
      'provider-failure',
    )
  })

  it('rejects a Storage key that does not match the owner and row identity', async () => {
    const { client } = createFakeClient(
      jsonResponse({
        ...sourceRow,
        storage_object_key:
          '1b89a870-0614-4b57-8574-934d629ba667/5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4.pdf',
      }),
    )
    const repository = createBaseResumePreviewRepository({ client, userId })

    await expectSanitizedFailure(
      () => repository.findActiveById(baseResumeId),
      'unexpected-result',
    )
  })

  it('rejects malformed provider data', async () => {
    const { client } = createFakeClient(
      jsonResponse({ ...sourceRow, original_filename: '' }),
    )
    const repository = createBaseResumePreviewRepository({ client, userId })

    await expectSanitizedFailure(
      () => repository.findActiveById(baseResumeId),
      'unexpected-result',
    )
  })
})
