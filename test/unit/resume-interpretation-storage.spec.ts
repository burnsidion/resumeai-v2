import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { BASE_RESUME_BUCKET_NAME } from '../../server/infrastructure/supabase/base-resume-storage'
import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  createResumeInterpretationStorage,
  type ResumeInterpretationStorageError,
} from '../../server/infrastructure/supabase/resume-interpretation-storage'

const objectKey =
  '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0/5bcf1bf6-ecbc-452f-ae6d-c1e8132e2ad4.pdf'
const providerMessage = 'Sensitive Storage provider details'

interface FakeSupabaseClient {
  client: SupabaseClient<Database>
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
}

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

describe('resume interpretation Storage adapter', () => {
  it('downloads the exact private base-resume object as bytes', async () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.7\n%%EOF')
    const { client, fetchMock } = createFakeClient(
      new Response(pdfBytes, {
        headers: { 'content-type': 'application/pdf' },
      }),
    )
    const storage = createResumeInterpretationStorage(client)

    await expect(storage.downloadPrivatePdf(objectKey)).resolves.toEqual(
      pdfBytes,
    )

    const [input, init] = fetchMock.mock.calls[0] ?? []
    const url = new URL(
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input
          : (input?.toString() ?? ''),
    )

    expect(init?.method).toBe('GET')
    expect(url.pathname).toBe(
      `/storage/v1/object/${BASE_RESUME_BUCKET_NAME}/${objectKey}`,
    )
  })

  it('sanitizes private-download provider failures', async () => {
    const { client } = createFakeClient(
      new Response(JSON.stringify({ message: providerMessage }), {
        headers: { 'content-type': 'application/json' },
        status: 503,
      }),
    )
    const storage = createResumeInterpretationStorage(client)

    await expect(storage.downloadPrivatePdf(objectKey)).rejects.toMatchObject({
      code: 'resume-interpretation-storage-unavailable',
      message: 'The selected base resume is temporarily unavailable.',
      operation: 'download-private-base-resume',
    } satisfies Partial<ResumeInterpretationStorageError>)
  })
})
