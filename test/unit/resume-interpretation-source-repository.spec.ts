import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  createResumeInterpretationSourceRepository,
  type ResumeInterpretationSourceRepositoryError,
} from '../../server/repositories/resume-interpretation-source'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = 'b68abca5-5abc-4b96-98ae-9fdb39a9c6df'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const contentSha256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const objectKey = `${userId}/${baseResumeId}.pdf`
const providerMessage = 'Sensitive PostgREST provider details'

const sourceRow = {
  id: applicationId,
  selected_base_resume: {
    active_slot: 1,
    content_sha256: contentSha256,
    content_type: 'application/pdf',
    id: baseResumeId,
    original_filename: 'Frontend Engineer.pdf',
    retired_at: null,
    size_bytes: 4096,
    storage_object_key: objectKey,
  },
  selected_base_resume_id: baseResumeId,
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

describe('resume interpretation source repository', () => {
  it('returns only the owner-scoped active selected base resume', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(sourceRow))
    const repository = createResumeInterpretationSourceRepository({
      client,
      userId,
    })

    await expect(repository.findForApplication(applicationId)).resolves.toEqual(
      {
        baseResumeId,
        contentSha256,
        originalFilename: 'Frontend Engineer.pdf',
        sizeBytes: 4096,
        storageObjectKey: objectKey,
      },
    )

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('GET')
    expect(request.url.pathname).toBe('/rest/v1/applications')
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${applicationId}`)
    expect(request.url.searchParams.get('select')).toContain(
      'selected_base_resume:base_resumes!applications_selected_base_resume_fkey',
    )
  })

  it('returns null when an owned application has no selected base resume', async () => {
    const { client } = createFakeClient(
      jsonResponse({
        id: applicationId,
        selected_base_resume: null,
        selected_base_resume_id: null,
      }),
    )
    const repository = createResumeInterpretationSourceRepository({
      client,
      userId,
    })

    await expect(
      repository.findForApplication(applicationId),
    ).resolves.toBeNull()
  })

  it('returns null when an application still references a retired base resume', async () => {
    const { client } = createFakeClient(
      jsonResponse({
        ...sourceRow,
        selected_base_resume: {
          ...sourceRow.selected_base_resume,
          active_slot: null,
          retired_at: '2026-09-17T06:15:00+00:00',
        },
      }),
    )
    const repository = createResumeInterpretationSourceRepository({
      client,
      userId,
    })

    await expect(
      repository.findForApplication(applicationId),
    ).resolves.toBeNull()
  })

  it('returns null for a missing or cross-owner application', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createResumeInterpretationSourceRepository({
      client,
      userId,
    })

    await expect(
      repository.findForApplication(applicationId),
    ).resolves.toBeNull()
  })

  it('sanitizes malformed source relationships and provider failures', async () => {
    const malformed = createFakeClient(
      jsonResponse({
        ...sourceRow,
        selected_base_resume: {
          ...sourceRow.selected_base_resume,
          storage_object_key: 'other-user/other-resume.pdf',
        },
      }),
    )
    const repository = createResumeInterpretationSourceRepository({
      client: malformed.client,
      userId,
    })

    await expect(
      repository.findForApplication(applicationId),
    ).rejects.toMatchObject({
      code: 'resume-interpretation-source-unavailable',
      kind: 'unexpected-result',
    } satisfies Partial<ResumeInterpretationSourceRepositoryError>)

    const unavailable = createFakeClient(
      jsonResponse({ message: providerMessage }, 503),
    )
    const unavailableRepository = createResumeInterpretationSourceRepository({
      client: unavailable.client,
      userId,
    })

    await expect(
      unavailableRepository.findForApplication(applicationId),
    ).rejects.toMatchObject({
      code: 'resume-interpretation-source-unavailable',
      kind: 'provider-failure',
      message: 'The selected base resume is temporarily unavailable.',
    } satisfies Partial<ResumeInterpretationSourceRepositoryError>)
  })
})
