import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  BaseResumeRetirementRepositoryError,
  createBaseResumeRetirementRepository,
} from '../../server/repositories/base-resume-retirement'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const retiredAt = '2026-08-19T04:30:00+00:00'
const providerMessage = 'Sensitive PostgREST provider details'

const retiredRow = {
  active_slot: null,
  id: baseResumeId,
  retired_at: retiredAt,
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

const providerErrorResponse = (): Response =>
  jsonResponse(
    {
      code: 'PGRST_TEST',
      details: providerMessage,
      hint: null,
      message: providerMessage,
    },
    503,
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
    kind: BaseResumeRetirementRepositoryError['kind']
    operation: BaseResumeRetirementRepositoryError['operation']
  },
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BaseResumeRetirementRepositoryError)
    expect(error).toMatchObject({
      code: 'base-resume-retirement-unavailable',
      kind: expected.kind,
      message: 'Base resume retirement is temporarily unavailable.',
      operation: expected.operation,
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the base-resume retirement repository to fail.')
}

describe('base-resume retirement repository', () => {
  it('retires only the owner-scoped active row and returns a narrow result', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(retiredRow))
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expect(repository.retire(baseResumeId, retiredAt)).resolves.toEqual({
      id: baseResumeId,
      retiredAt,
    })

    const request = getRequest(fetchMock)
    const body = JSON.parse(request.init?.body as string) as Record<
      string,
      unknown
    >

    expect(request.init?.method).toBe('PATCH')
    expect(request.url.pathname).toBe('/rest/v1/base_resumes')
    expect(request.url.searchParams.get('select')).toBe(
      'id,active_slot,retired_at',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${baseResumeId}`)
    expect(request.url.searchParams.get('active_slot')).toBe('not.is.null')
    expect(request.url.searchParams.get('retired_at')).toBe('is.null')
    expect(body).toEqual({ active_slot: null, retired_at: retiredAt })
  })

  it('returns null when no active owned row was retired', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expect(repository.retire(baseResumeId, retiredAt)).resolves.toBeNull()
  })

  it('returns an owner-scoped active lifecycle state', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse({
        active_slot: 2,
        id: baseResumeId,
        retired_at: null,
      }),
    )
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expect(repository.findLifecycleById(baseResumeId)).resolves.toEqual({
      activeSlot: 2,
      id: baseResumeId,
      retiredAt: null,
      state: 'active',
    })

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('GET')
    expect(request.url.searchParams.get('select')).toBe(
      'id,active_slot,retired_at',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${baseResumeId}`)
  })

  it('returns an owner-scoped retired lifecycle state', async () => {
    const { client } = createFakeClient(jsonResponse(retiredRow))
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expect(repository.findLifecycleById(baseResumeId)).resolves.toEqual({
      activeSlot: null,
      id: baseResumeId,
      retiredAt,
      state: 'retired',
    })
  })

  it('returns null when no owner-visible lifecycle row exists', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expect(repository.findLifecycleById(baseResumeId)).resolves.toBeNull()
  })

  it('sanitizes retirement provider failures', async () => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.retire(baseResumeId, retiredAt),
      {
        kind: 'provider-failure',
        operation: 'retire-base-resume',
      },
    )
  })

  it('sanitizes lifecycle lookup provider failures', async () => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.findLifecycleById(baseResumeId),
      {
        kind: 'provider-failure',
        operation: 'find-base-resume-lifecycle',
      },
    )
  })

  it('sanitizes an unexpected retirement result', async () => {
    const { client } = createFakeClient(
      jsonResponse({ ...retiredRow, active_slot: 1 }),
    )
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.retire(baseResumeId, retiredAt),
      {
        kind: 'unexpected-result',
        operation: 'retire-base-resume',
      },
    )
  })

  it('sanitizes an inconsistent lifecycle result', async () => {
    const { client } = createFakeClient(
      jsonResponse({ ...retiredRow, retired_at: null }),
    )
    const repository = createBaseResumeRetirementRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.findLifecycleById(baseResumeId),
      {
        kind: 'unexpected-result',
        operation: 'find-base-resume-lifecycle',
      },
    )
  })
})
