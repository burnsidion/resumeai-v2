import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  BaseResumeUploadRepositoryError,
  createBaseResumeUploadRepository,
  type CreateBaseResumeRecord,
} from '../../server/repositories/base-resume-uploads'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const providerMessage = 'Sensitive PostgREST provider details'

const record: CreateBaseResumeRecord = {
  activeSlot: 2,
  contentSha256:
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  id: baseResumeId,
  originalFilename: 'Frontend Engineer.pdf',
  sizeBytes: 4096,
  storageObjectKey: `${userId}/${baseResumeId}.pdf`,
}

const persistedRow = {
  active_slot: record.activeSlot,
  content_sha256: record.contentSha256,
  content_type: 'application/pdf',
  created_at: '2026-08-05T06:15:00+00:00',
  id: record.id,
  original_filename: record.originalFilename,
  retired_at: null,
  size_bytes: record.sizeBytes,
  storage_object_key: record.storageObjectKey,
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

const providerErrorResponse = (
  code = 'PGRST_TEST',
  message = providerMessage,
  status = 503,
): Response =>
  jsonResponse(
    {
      code,
      details: providerMessage,
      hint: null,
      message,
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

const expectSanitizedRepositoryFailure = async (
  action: () => Promise<unknown>,
  expected: {
    kind: BaseResumeUploadRepositoryError['kind']
    operation: BaseResumeUploadRepositoryError['operation']
  },
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumeUploadRepositoryError)
    expect(error).toMatchObject({
      code: 'base-resume-persistence-unavailable',
      kind: expected.kind,
      message: 'Base resume persistence is temporarily unavailable.',
      operation: expected.operation,
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume upload repository to fail.')
}

describe('base-resume upload repository', () => {
  it('lists only the owner-scoped active slots in deterministic order', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse([{ active_slot: 1 }, { active_slot: 3 }]),
    )
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expect(repository.listActiveSlots()).resolves.toEqual([1, 3])

    const request = getRequest(fetchMock)

    expect(request.url.pathname).toBe('/rest/v1/base_resumes')
    expect(request.url.searchParams.get('select')).toBe('active_slot')
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('active_slot')).toBe('not.is.null')
    expect(request.url.searchParams.get('order')).toBe('active_slot.asc')
    expect(request.url.searchParams.get('limit')).toBe('3')
  })

  it('inserts the trusted owner and returns the narrow persistence result', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(persistedRow))
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expect(repository.create(record)).resolves.toEqual({
      ...record,
      contentType: 'application/pdf',
      createdAt: persistedRow.created_at,
      retiredAt: null,
    })

    const request = getRequest(fetchMock)
    const body = JSON.parse(request.init?.body as string) as Record<
      string,
      unknown
    >

    expect(request.init?.method).toBe('POST')
    expect(request.url.pathname).toBe('/rest/v1/base_resumes')
    expect(request.url.searchParams.get('select')).toBe(
      'id,original_filename,storage_object_key,content_type,size_bytes,content_sha256,active_slot,created_at,retired_at',
    )
    expect(body).toEqual({
      active_slot: record.activeSlot,
      content_sha256: record.contentSha256,
      content_type: 'application/pdf',
      id: record.id,
      original_filename: record.originalFilename,
      size_bytes: record.sizeBytes,
      storage_object_key: record.storageObjectKey,
      user_id: userId,
    })
  })

  it('reconciles by generated identity with an explicit owner filter', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(persistedRow))
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expect(repository.findById(baseResumeId)).resolves.toMatchObject({
      id: baseResumeId,
      storageObjectKey: record.storageObjectKey,
    })

    const request = getRequest(fetchMock)

    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${baseResumeId}`)
  })

  it('returns null when reconciliation finds no owned row', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expect(repository.findById(baseResumeId)).resolves.toBeNull()
  })

  it('classifies only the migration-controlled slot conflict as retryable', async () => {
    const { client } = createFakeClient(
      providerErrorResponse(
        '23505',
        'duplicate key value violates unique constraint "base_resumes_user_active_slot_key"',
        409,
      ),
    )
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expectSanitizedRepositoryFailure(() => repository.create(record), {
      kind: 'active-slot-conflict',
      operation: 'create-base-resume',
    })
  })

  it('does not classify an unrelated uniqueness failure as a slot conflict', async () => {
    const { client } = createFakeClient(
      providerErrorResponse(
        '23505',
        'duplicate key value violates unique constraint "base_resumes_pkey"',
        409,
      ),
    )
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expectSanitizedRepositoryFailure(() => repository.create(record), {
      kind: 'provider-failure',
      operation: 'create-base-resume',
    })
  })

  it('sanitizes unexpected provider values at the persistence boundary', async () => {
    const { client } = createFakeClient(
      jsonResponse({ ...persistedRow, content_type: 'text/plain' }),
    )
    const repository = createBaseResumeUploadRepository({ client, userId })

    await expectSanitizedRepositoryFailure(() => repository.create(record), {
      kind: 'unexpected-result',
      operation: 'create-base-resume',
    })
  })
})
