import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import {
  RESUME_INTERPRETATION_SCHEMA_VERSION,
  RESUME_INTERPRETER_NAME,
  RESUME_INTERPRETER_VERSION,
} from '../../server/domain/resume-interpretations/contracts'
import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  createResumeInterpretationsRepository,
  type CreateResumeInterpretationRecord,
  type ResumeInterpretationsRepositoryError,
} from '../../server/repositories/resume-interpretations'
import { createResumeInterpretationStructuredContent } from '../../server/domain/resume-interpretations/interpret'
import { syntheticResumeExtraction } from '../fixtures/resume-interpretation'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const baseResumeId = '5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4'
const interpretationId = 'a9772e5d-40ef-4f9e-b8ca-1b6d6cc8e06c'
const sourceResumeSha256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const contentSha256 =
  'be7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const providerMessage = 'Sensitive PostgREST provider details'
const structuredContent = createResumeInterpretationStructuredContent(
  syntheticResumeExtraction,
)

const record: CreateResumeInterpretationRecord = {
  baseResumeId,
  contentSha256,
  interpreterName: RESUME_INTERPRETER_NAME,
  interpreterVersion: RESUME_INTERPRETER_VERSION,
  schemaVersion: RESUME_INTERPRETATION_SCHEMA_VERSION,
  sourceResumeSha256,
  structuredContent,
}

const persistedRow = {
  base_resume_id: baseResumeId,
  content_sha256: contentSha256,
  created_at: '2026-09-17T06:15:00+00:00',
  id: interpretationId,
  interpreter_name: record.interpreterName,
  interpreter_version: record.interpreterVersion,
  schema_version: record.schemaVersion,
  source_resume_sha256: sourceResumeSha256,
  structured_content: structuredContent,
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

describe('resume interpretations repository', () => {
  it('finds an exact reusable interpretation in the authenticated owner scope', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(persistedRow))
    const repository = createResumeInterpretationsRepository({ client, userId })

    await expect(repository.findByIdentity(record)).resolves.toMatchObject({
      ...record,
      createdAt: persistedRow.created_at,
      id: interpretationId,
    })

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('GET')
    expect(request.url.pathname).toBe('/rest/v1/resume_interpretations')
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('base_resume_id')).toBe(
      `eq.${baseResumeId}`,
    )
    expect(request.url.searchParams.get('source_resume_sha256')).toBe(
      `eq.${sourceResumeSha256}`,
    )
    expect(request.url.searchParams.get('interpreter_name')).toBe(
      `eq.${RESUME_INTERPRETER_NAME}`,
    )
    expect(request.url.searchParams.get('interpreter_version')).toBe(
      `eq.${RESUME_INTERPRETER_VERSION}`,
    )
    expect(request.url.searchParams.get('schema_version')).toBe(
      `eq.${RESUME_INTERPRETATION_SCHEMA_VERSION}`,
    )
  })

  it('returns null when no exact reusable interpretation exists', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createResumeInterpretationsRepository({ client, userId })

    await expect(repository.findByIdentity(record)).resolves.toBeNull()
  })

  it('inserts immutable interpretation data under the trusted owner', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(persistedRow))
    const repository = createResumeInterpretationsRepository({ client, userId })

    await expect(repository.create(record)).resolves.toMatchObject({
      ...record,
      createdAt: persistedRow.created_at,
      id: interpretationId,
    })

    const request = getRequest(fetchMock)
    const body = JSON.parse(request.init?.body as string) as Record<
      string,
      unknown
    >

    expect(request.init?.method).toBe('POST')
    expect(request.url.pathname).toBe('/rest/v1/resume_interpretations')
    expect(body).toEqual({
      base_resume_id: baseResumeId,
      content_sha256: contentSha256,
      interpreter_name: RESUME_INTERPRETER_NAME,
      interpreter_version: RESUME_INTERPRETER_VERSION,
      schema_version: RESUME_INTERPRETATION_SCHEMA_VERSION,
      source_resume_sha256: sourceResumeSha256,
      structured_content: structuredContent,
      user_id: userId,
    })
  })

  it('sanitizes malformed provider results and provider failures', async () => {
    const malformed = createFakeClient(
      jsonResponse({ ...persistedRow, content_sha256: 'not-a-sha256' }),
    )
    const repository = createResumeInterpretationsRepository({
      client: malformed.client,
      userId,
    })

    await expect(repository.findByIdentity(record)).rejects.toMatchObject({
      code: 'resume-interpretation-persistence-unavailable',
      kind: 'unexpected-result',
      operation: 'find-resume-interpretation',
    } satisfies Partial<ResumeInterpretationsRepositoryError>)

    const unavailable = createFakeClient(
      jsonResponse({ message: providerMessage }, 503),
    )
    const unavailableRepository = createResumeInterpretationsRepository({
      client: unavailable.client,
      userId,
    })

    await expect(unavailableRepository.create(record)).rejects.toMatchObject({
      code: 'resume-interpretation-persistence-unavailable',
      kind: 'provider-failure',
      message: 'Resume interpretation data is temporarily unavailable.',
      operation: 'create-resume-interpretation',
    } satisfies Partial<ResumeInterpretationsRepositoryError>)
  })
})
