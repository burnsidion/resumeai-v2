import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../../server/infrastructure/supabase/database.generated'
import {
  ApplicationManagementRepositoryError,
  createApplicationManagementRepository,
  type ApplicationManagementRepository,
  type ApplicationManagementRepositoryOperation,
  type CreateApplicationRecord,
  type UpdateApplicationRecord,
} from '../../server/repositories/application-management'

const userId = '22b1b8e1-cee9-4ca9-ab65-96e1f039e8b0'
const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const createdAt = '2026-08-19T18:00:00+00:00'
const updatedAt = '2026-08-20T18:00:00+00:00'
const providerMessage = 'Sensitive PostgREST provider details'

const activeSelectedResumeRow = {
  active_slot: 1,
  id: baseResumeId,
  original_filename: 'Frontend Engineering.pdf',
  retired_at: null,
}

const applicationRow = {
  applied_on: null,
  company: 'Northstar Labs',
  created_at: createdAt,
  id: applicationId,
  job_description: 'Build calm, accessible product experiences.',
  notes: null,
  posting_url: 'https://example.com/jobs/123',
  role: 'Senior Frontend Engineer',
  selected_base_resume: activeSelectedResumeRow,
  selected_base_resume_id: baseResumeId,
  status: 'draft',
  updated_at: updatedAt,
}

const createRecord: CreateApplicationRecord = {
  company: applicationRow.company,
  createdAt,
  jobDescription: applicationRow.job_description,
  notes: applicationRow.notes,
  postingUrl: applicationRow.posting_url,
  role: applicationRow.role,
  selectedBaseResumeId: baseResumeId,
  status: 'draft',
  updatedAt,
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
  operation: ApplicationManagementRepositoryOperation,
  kind: ApplicationManagementRepositoryError['kind'] = 'provider-failure',
): Promise<void> => {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationManagementRepositoryError)
    expect(error).toMatchObject({
      code: 'application-persistence-unavailable',
      kind,
      message: 'Application persistence is temporarily unavailable.',
      operation,
    })
    expect((error as Error).message).not.toContain(providerMessage)
    expect(JSON.stringify(error)).not.toContain(providerMessage)
    return
  }

  throw new Error('Expected the application management repository to fail.')
}

describe('application management repository', () => {
  it('creates an application with the trusted owner and a narrow result', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(applicationRow))
    const repository = createApplicationManagementRepository({ client, userId })

    await expect(repository.create(createRecord)).resolves.toEqual({
      appliedOn: null,
      company: applicationRow.company,
      createdAt,
      id: applicationId,
      jobDescription: applicationRow.job_description,
      notes: null,
      postingUrl: applicationRow.posting_url,
      role: applicationRow.role,
      selectedBaseResume: {
        activeSlot: 1,
        id: baseResumeId,
        originalFilename: 'Frontend Engineering.pdf',
        retiredAt: null,
      },
      selectedBaseResumeId: baseResumeId,
      status: 'draft',
      updatedAt,
    })

    const request = getRequest(fetchMock)
    const body = JSON.parse(request.init?.body as string) as Record<
      string,
      unknown
    >

    expect(request.init?.method).toBe('POST')
    expect(request.url.pathname).toBe('/rest/v1/applications')
    expect(request.url.searchParams.get('select')).toBe(
      'id,company,role,job_description,posting_url,notes,status,applied_on,selected_base_resume_id,created_at,updated_at,selected_base_resume:base_resumes!applications_selected_base_resume_fkey(id,original_filename,active_slot,retired_at)',
    )
    expect(body).toEqual({
      applied_on: null,
      company: createRecord.company,
      created_at: createdAt,
      job_description: createRecord.jobDescription,
      notes: null,
      posting_url: createRecord.postingUrl,
      role: createRecord.role,
      selected_base_resume_id: baseResumeId,
      status: 'draft',
      updated_at: updatedAt,
      user_id: userId,
    })
    expect(body).not.toHaveProperty('submitted_finalized_resume_id')
  })

  it('lists only owner-scoped applications in deterministic order', async () => {
    const retiredAt = '2026-08-21T18:00:00+00:00'
    const retiredRow = {
      ...applicationRow,
      id: '7077c821-56ad-4a0a-921f-68a1020a5652',
      selected_base_resume: {
        ...activeSelectedResumeRow,
        active_slot: null,
        retired_at: retiredAt,
      },
      updated_at: retiredAt,
    }
    const { client, fetchMock } = createFakeClient(
      jsonResponse([retiredRow, applicationRow]),
    )
    const repository = createApplicationManagementRepository({ client, userId })

    const applications = await repository.list()

    expect(applications).toHaveLength(2)
    expect(applications[0]).toMatchObject({
      id: retiredRow.id,
      selectedBaseResume: {
        activeSlot: null,
        id: baseResumeId,
        retiredAt,
      },
    })
    expect(applications[0]).not.toHaveProperty('userId')
    expect(applications[0]?.selectedBaseResume).not.toHaveProperty(
      'storageObjectKey',
    )

    const request = getRequest(fetchMock)

    expect(request.init?.method).toBe('GET')
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('order')).toBe(
      'updated_at.desc,id.desc',
    )
    expect(request.url.searchParams.has('limit')).toBe(false)
  })

  it('loads one application with explicit owner and ID filters', async () => {
    const { client, fetchMock } = createFakeClient(jsonResponse(applicationRow))
    const repository = createApplicationManagementRepository({ client, userId })

    await expect(repository.findById(applicationId)).resolves.toMatchObject({
      id: applicationId,
      selectedBaseResumeId: baseResumeId,
    })

    const request = getRequest(fetchMock)

    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${applicationId}`)
  })

  it('returns null when no owner-visible application exists', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createApplicationManagementRepository({ client, userId })

    await expect(repository.findById(applicationId)).resolves.toBeNull()
  })

  it('updates only supplied mutable fields with owner scoping', async () => {
    const update: UpdateApplicationRecord = {
      appliedOn: '2026-08-20',
      company: 'Updated Company',
      jobDescription: null,
      selectedBaseResumeId: null,
      status: 'applied',
      updatedAt: '2026-08-22T18:00:00+00:00',
    }
    const updatedRow = {
      ...applicationRow,
      applied_on: update.appliedOn,
      company: update.company,
      job_description: null,
      selected_base_resume: null,
      selected_base_resume_id: null,
      status: update.status,
      updated_at: update.updatedAt,
    }
    const { client, fetchMock } = createFakeClient(jsonResponse(updatedRow))
    const repository = createApplicationManagementRepository({ client, userId })

    await expect(
      repository.update(applicationId, update),
    ).resolves.toMatchObject({
      company: 'Updated Company',
      id: applicationId,
      selectedBaseResume: null,
      status: 'applied',
    })

    const request = getRequest(fetchMock)
    const body = JSON.parse(request.init?.body as string) as Record<
      string,
      unknown
    >

    expect(request.init?.method).toBe('PATCH')
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(request.url.searchParams.get('id')).toBe(`eq.${applicationId}`)
    expect(body).toEqual({
      applied_on: '2026-08-20',
      company: 'Updated Company',
      job_description: null,
      selected_base_resume_id: null,
      status: 'applied',
      updated_at: update.updatedAt,
    })
    expect(body).not.toHaveProperty('user_id')
    expect(body).not.toHaveProperty('submitted_finalized_resume_id')
  })

  it('returns null when an owner-scoped update finds no row', async () => {
    const { client } = createFakeClient(jsonResponse(null))
    const repository = createApplicationManagementRepository({ client, userId })

    await expect(
      repository.update(applicationId, { role: 'Staff Engineer', updatedAt }),
    ).resolves.toBeNull()
  })

  it.each<{
    operation: ApplicationManagementRepositoryOperation
    run(repository: ApplicationManagementRepository): Promise<unknown>
  }>([
    {
      operation: 'create-application',
      run: (repository) => repository.create(createRecord),
    },
    {
      operation: 'find-application',
      run: (repository) => repository.findById(applicationId),
    },
    {
      operation: 'list-applications',
      run: (repository) => repository.list(),
    },
    {
      operation: 'update-application',
      run: (repository) =>
        repository.update(applicationId, { role: 'Staff Engineer', updatedAt }),
    },
  ])('sanitizes $operation provider failures', async ({ operation, run }) => {
    const { client } = createFakeClient(providerErrorResponse())
    const repository = createApplicationManagementRepository({ client, userId })

    await expectSanitizedRepositoryFailure(() => run(repository), operation)
  })

  it('sanitizes an inconsistent selected-resume relationship', async () => {
    const { client } = createFakeClient(
      jsonResponse({
        ...applicationRow,
        selected_base_resume: {
          ...activeSelectedResumeRow,
          id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
        },
      }),
    )
    const repository = createApplicationManagementRepository({ client, userId })

    await expectSanitizedRepositoryFailure(
      () => repository.findById(applicationId),
      'find-application',
      'unexpected-result',
    )
  })

  it('treats an empty list as a successful product state', async () => {
    const { client } = createFakeClient(jsonResponse([]))
    const repository = createApplicationManagementRepository({ client, userId })

    await expect(repository.list()).resolves.toEqual([])
  })
})
