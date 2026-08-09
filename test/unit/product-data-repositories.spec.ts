import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  ACTIVE_APPLICATION_STATUSES,
  createApplicationsRepository,
  RECENT_APPLICATION_LIMIT,
} from '../../server/repositories/applications'
import {
  ACTIVE_BASE_RESUME_LIMIT,
  createBaseResumesManagementRepository,
  createBaseResumesRepository,
} from '../../server/repositories/base-resumes'
import { ProductDataRepositoryError } from '../../server/repositories/product-data/errors'
import { createWorkingCopiesRepository } from '../../server/repositories/working-copies'

const userId = '7bd6a80d-1a72-47b7-b55f-60a55507fd2a'
const providerMessage = 'Sensitive PostgREST provider details'

interface FakeSupabaseClient {
  client: SupabaseClient<Database>
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
}

const jsonResponse = (
  body: unknown,
  options: {
    contentRange?: string
    status?: number
  } = {},
): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    headers: {
      'content-range': options.contentRange ?? '0-0/*',
      'content-type': 'application/json',
    },
    status: options.status ?? 200,
  })

const providerErrorResponse = (): Response =>
  jsonResponse(
    {
      code: 'PGRST_TEST',
      details: providerMessage,
      hint: null,
      message: providerMessage,
    },
    { status: 503 },
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
        global: {
          fetch: fetchMock,
        },
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
  read: () => Promise<unknown>,
  operation: ProductDataRepositoryError['operation'],
): Promise<void> => {
  try {
    await read()
  } catch (error) {
    expect(error).toBeInstanceOf(ProductDataRepositoryError)
    expect(error).toMatchObject({
      code: 'product-data-unavailable',
      message: 'Product data could not be loaded.',
      operation,
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the repository read to fail.')
}

describe('applications repository', () => {
  it('returns approved summary counts with explicit owner and status filters', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse(null, { contentRange: '0-3/4' }),
      jsonResponse(null, { contentRange: '0-0/1' }),
    )
    const repository = createApplicationsRepository({ client, userId })

    await expect(repository.getSummary()).resolves.toEqual({
      activeCount: 4,
      interviewCount: 1,
    })

    const activeRequest = getRequest(fetchMock)
    const interviewRequest = getRequest(fetchMock, 1)

    expect(activeRequest.init?.method).toBe('HEAD')
    expect(activeRequest.url.pathname).toBe('/rest/v1/applications')
    expect(activeRequest.url.searchParams.get('select')).toBe('id')
    expect(activeRequest.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(activeRequest.url.searchParams.get('status')).toBe(
      `in.(${ACTIVE_APPLICATION_STATUSES.join(',')})`,
    )

    expect(interviewRequest.init?.method).toBe('HEAD')
    expect(interviewRequest.url.searchParams.get('user_id')).toBe(
      `eq.${userId}`,
    )
    expect(interviewRequest.url.searchParams.get('status')).toBe(
      'eq.interviewing',
    )
  })

  it('returns only the narrow, deterministically ordered recent projection', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse([
        {
          applied_on: '2026-07-22',
          company: 'Lantern Health',
          created_at: '2026-07-20T18:00:00+00:00',
          id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
          role: 'Product Engineer',
          status: 'applied',
          updated_at: '2026-07-22T18:00:00+00:00',
          user_id: userId,
        },
      ]),
    )
    const repository = createApplicationsRepository({ client, userId })

    await expect(repository.listRecent()).resolves.toEqual([
      {
        appliedOn: '2026-07-22',
        company: 'Lantern Health',
        createdAt: '2026-07-20T18:00:00+00:00',
        id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
        role: 'Product Engineer',
        status: 'applied',
        updatedAt: '2026-07-22T18:00:00+00:00',
      },
    ])

    const request = getRequest(fetchMock)

    expect(request.url.searchParams.get('select')).toBe(
      'id,company,role,status,applied_on,created_at,updated_at',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('order')).toBe(
      'updated_at.desc,id.desc',
    )
    expect(request.url.searchParams.get('limit')).toBe(
      RECENT_APPLICATION_LIMIT.toString(),
    )
  })

  it('returns an empty recent collection truthfully', async () => {
    const { client } = createFakeClient(jsonResponse([]))
    const repository = createApplicationsRepository({ client, userId })

    await expect(repository.listRecent()).resolves.toEqual([])
  })

  it('sanitizes provider failures for application reads', async () => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createApplicationsRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.listRecent(),
      'read-recent-applications',
    )
  })

  it('sanitizes provider failures for application summary counts', async () => {
    const { client } = createFakeClient(
      providerErrorResponse(),
      jsonResponse(null, { contentRange: '*/0' }),
    )
    const repository = createApplicationsRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.getSummary(),
      'read-application-summary',
    )
  })

  it('sanitizes unexpected database values at the repository boundary', async () => {
    const { client } = createFakeClient(
      jsonResponse([
        {
          applied_on: null,
          company: 'Lantern Health',
          created_at: '2026-07-20T18:00:00+00:00',
          id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
          role: 'Product Engineer',
          status: 'provider-only-status',
          updated_at: '2026-07-22T18:00:00+00:00',
        },
      ]),
    )
    const repository = createApplicationsRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.listRecent(),
      'read-recent-applications',
    )
  })
})

describe('base-resumes repository', () => {
  it('returns active resumes without exposing source or ownership fields', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse(
        [
          {
            active_slot: 1,
            content_sha256: 'a'.repeat(64),
            created_at: '2026-07-20T18:00:00+00:00',
            id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
            original_filename: 'Frontend Engineering.pdf',
            storage_object_key: `${userId}/private-source.pdf`,
            user_id: userId,
          },
        ],
        { contentRange: '0-0/1' },
      ),
    )
    const repository = createBaseResumesRepository({ client, userId })

    await expect(repository.getActive()).resolves.toEqual({
      activeCount: 1,
      activeLimit: 3,
      items: [
        {
          activeSlot: 1,
          createdAt: '2026-07-20T18:00:00+00:00',
          id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
          originalFilename: 'Frontend Engineering.pdf',
        },
      ],
    })

    const request = getRequest(fetchMock)

    expect(request.url.searchParams.get('select')).toBe(
      'id,original_filename,active_slot,created_at',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('active_slot')).toBe('not.is.null')
    expect(request.url.searchParams.get('order')).toBe(
      'created_at.desc,id.desc',
    )
    expect(request.url.searchParams.get('limit')).toBe(
      ACTIVE_BASE_RESUME_LIMIT.toString(),
    )
  })

  it('returns the empty active-resume state', async () => {
    const { client } = createFakeClient(
      jsonResponse([], { contentRange: '*/0' }),
    )
    const repository = createBaseResumesRepository({ client, userId })

    await expect(repository.getActive()).resolves.toEqual({
      activeCount: 0,
      activeLimit: 3,
      items: [],
    })
  })

  it('sanitizes provider failures for base-resume reads', async () => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createBaseResumesRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.getActive(),
      'read-active-base-resumes',
    )
  })

  it('returns the narrow management projection in deterministic slot order', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse(
        [
          {
            active_slot: 1,
            content_sha256: 'a'.repeat(64),
            created_at: '2026-07-20T18:00:00+00:00',
            id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
            original_filename: 'Frontend Engineering.pdf',
            retired_at: null,
            size_bytes: 493_568,
            storage_object_key: `${userId}/private-source.pdf`,
            user_id: userId,
          },
          {
            active_slot: 2,
            content_sha256: 'b'.repeat(64),
            created_at: '2026-07-14T18:00:00+00:00',
            id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
            original_filename: 'Accessibility Specialist.pdf',
            retired_at: null,
            size_bytes: 628_736,
            storage_object_key: `${userId}/private-source-2.pdf`,
            user_id: userId,
          },
        ],
        { contentRange: '0-1/2' },
      ),
    )
    const repository = createBaseResumesManagementRepository({
      client,
      userId,
    })

    await expect(repository.getActiveForManagement()).resolves.toEqual({
      activeCount: 2,
      activeLimit: 3,
      items: [
        {
          activeSlot: 1,
          createdAt: '2026-07-20T18:00:00+00:00',
          id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
          originalFilename: 'Frontend Engineering.pdf',
          sizeBytes: 493_568,
        },
        {
          activeSlot: 2,
          createdAt: '2026-07-14T18:00:00+00:00',
          id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
          originalFilename: 'Accessibility Specialist.pdf',
          sizeBytes: 628_736,
        },
      ],
    })

    const request = getRequest(fetchMock)

    expect(request.url.searchParams.get('select')).toBe(
      'id,original_filename,active_slot,created_at,size_bytes',
    )
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('active_slot')).toBe('not.is.null')
    expect(request.url.searchParams.get('retired_at')).toBe('is.null')
    expect(request.url.searchParams.get('order')).toBe('active_slot.asc,id.asc')
    expect(request.url.searchParams.get('limit')).toBe(
      ACTIVE_BASE_RESUME_LIMIT.toString(),
    )
  })

  it('returns the empty management state truthfully', async () => {
    const { client } = createFakeClient(
      jsonResponse([], { contentRange: '*/0' }),
    )
    const repository = createBaseResumesManagementRepository({
      client,
      userId,
    })

    await expect(repository.getActiveForManagement()).resolves.toEqual({
      activeCount: 0,
      activeLimit: 3,
      items: [],
    })
  })

  it('sanitizes provider failures for management reads', async () => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createBaseResumesManagementRepository({
      client,
      userId,
    })

    await expectSanitizedRepositoryFailure(
      () => repository.getActiveForManagement(),
      'read-active-base-resumes-management',
    )
  })

  it('sanitizes unexpected management values at the repository boundary', async () => {
    const { client } = createFakeClient(
      jsonResponse(
        [
          {
            active_slot: 4,
            created_at: '2026-07-20T18:00:00+00:00',
            id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
            original_filename: 'Frontend Engineering.pdf',
            size_bytes: 493_568,
          },
        ],
        { contentRange: '0-0/1' },
      ),
    )
    const repository = createBaseResumesManagementRepository({
      client,
      userId,
    })

    await expectSanitizedRepositoryFailure(
      () => repository.getActiveForManagement(),
      'read-active-base-resumes-management',
    )
  })
})

describe('working-copies repository', () => {
  it('returns one explicit, deterministically ordered review candidate', async () => {
    const { client, fetchMock } = createFakeClient(
      jsonResponse({
        application: {
          company: 'Northstar Labs',
          role: 'Senior Frontend Engineer',
        },
        application_id: 'dd87d5fd-ad50-46da-b07f-b5470e03aca7',
        id: '4ee6178a-a5b7-4f0a-8ff9-9b04756846a8',
        state: 'awaiting_review',
        updated_at: '2026-07-27T18:00:00+00:00',
        user_id: userId,
      }),
    )
    const repository = createWorkingCopiesRepository({ client, userId })

    await expect(repository.findReadyForReview()).resolves.toEqual({
      applicationId: 'dd87d5fd-ad50-46da-b07f-b5470e03aca7',
      company: 'Northstar Labs',
      role: 'Senior Frontend Engineer',
      state: 'awaiting_review',
      updatedAt: '2026-07-27T18:00:00+00:00',
      workingCopyId: '4ee6178a-a5b7-4f0a-8ff9-9b04756846a8',
    })

    const request = getRequest(fetchMock)
    const select = request.url.searchParams.get('select')

    expect(select).toContain(
      'application:applications!working_copies_application_fkey(company,role)',
    )
    expect(select).not.toContain('user_id')
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('state')).toBe('eq.awaiting_review')
    expect(request.url.searchParams.get('order')).toBe(
      'updated_at.desc,id.desc',
    )
    expect(request.url.searchParams.get('limit')).toBe('1')
  })

  it('returns null when no working copy awaits review', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createWorkingCopiesRepository({ client, userId })

    await expect(repository.findReadyForReview()).resolves.toBeNull()
  })

  it('sanitizes provider failures for working-copy reads', async () => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createWorkingCopiesRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.findReadyForReview(),
      'read-ready-for-review',
    )
  })
})
