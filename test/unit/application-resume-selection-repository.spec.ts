import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  ApplicationResumeSelectionRepositoryError,
  createApplicationResumeSelectionRepository,
} from '../../server/repositories/application-resume-selection'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const providerMessage = 'Sensitive PostgREST provider details'

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

  const url =
    input instanceof Request
      ? new URL(input.url)
      : new URL(input instanceof URL ? input : input.toString())

  return { init, url }
}

const expectSanitizedRepositoryFailure = async (
  action: () => Promise<unknown>,
  kind: ApplicationResumeSelectionRepositoryError['kind'],
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationResumeSelectionRepositoryError)
    expect(error).toMatchObject({
      code: 'application-resume-selection-unavailable',
      kind,
      message: 'Application resume selection is temporarily unavailable.',
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the resume-selection repository to fail.')
}

describe('application resume-selection repository', () => {
  it('loads only the explicitly owner-scoped active resume', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse({
        active_slot: 2,
        id: baseResumeId,
        original_filename: 'Frontend Engineering.pdf',
        retired_at: null,
      }),
    )
    const repository = createApplicationResumeSelectionRepository({
      client,
      userId,
    })

    await expect(repository.findAvailableById(baseResumeId)).resolves.toEqual({
      activeSlot: 2,
      id: baseResumeId,
      originalFilename: 'Frontend Engineering.pdf',
    })

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('GET')
    expect(request.url.pathname).toBe('/rest/v1/base_resumes')
    expect(request.url.searchParams.get('select')).toBe(
      'id,original_filename,active_slot,retired_at',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${baseResumeId}`)
    expect(request.url.searchParams.get('active_slot')).toBe('not.is.null')
    expect(request.url.searchParams.get('retired_at')).toBe('is.null')
  })

  it('returns null for missing, retired, or cross-owner resumes', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createApplicationResumeSelectionRepository({
      client,
      userId,
    })

    await expect(repository.findAvailableById(baseResumeId)).resolves.toBeNull()
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
    const repository = createApplicationResumeSelectionRepository({
      client,
      userId,
    })

    await expectSanitizedRepositoryFailure(
      () => repository.findAvailableById(baseResumeId),
      'provider-failure',
    )
  })

  it('sanitizes an unexpected lifecycle result', async () => {
    const { client } = createFakeClient(
      jsonResponse({
        active_slot: null,
        id: baseResumeId,
        original_filename: 'Frontend Engineering.pdf',
        retired_at: null,
      }),
    )
    const repository = createApplicationResumeSelectionRepository({
      client,
      userId,
    })

    await expectSanitizedRepositoryFailure(
      () => repository.findAvailableById(baseResumeId),
      'unexpected-result',
    )
  })
})
