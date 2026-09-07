import { z } from 'zod'

import type { ApplicationStatus } from '../../shared/applications/constraints'
import {
  applicationAppliedOnSchema,
  applicationCompanySchema,
  applicationIdSchema,
  applicationJobDescriptionSchema,
  applicationNotesSchema,
  applicationPostingUrlSchema,
  applicationRoleSchema,
  applicationStatusSchema,
} from '../../shared/applications/constraints'
import type {
  CreateApplicationRequest,
  UpdateApplicationRequest,
} from '../../shared/applications/management'
import {
  activeBaseResumeSlotSchema,
  baseResumeOriginalFilenameSchema,
  type ActiveBaseResumeSlot,
} from '../../shared/base-resumes/upload'
import type { Database } from '../infrastructure/supabase/database.generated'
import type { ProductDataRepositoryContext } from './product-data/context'

const applicationManagementProjection =
  'id,company,role,job_description,posting_url,notes,status,applied_on,selected_base_resume_id,created_at,updated_at,selected_base_resume:base_resumes!applications_selected_base_resume_fkey(id,original_filename,active_slot,retired_at)' as const

const timestampSchema = z.iso.datetime({ offset: true })

const activeSelectedBaseResumeRowSchema = z
  .object({
    active_slot: activeBaseResumeSlotSchema,
    id: z.uuid(),
    original_filename: baseResumeOriginalFilenameSchema,
    retired_at: z.null(),
  })
  .strict()

const retiredSelectedBaseResumeRowSchema = z
  .object({
    active_slot: z.null(),
    id: z.uuid(),
    original_filename: baseResumeOriginalFilenameSchema,
    retired_at: timestampSchema,
  })
  .strict()

const selectedBaseResumeRowSchema = z.union([
  activeSelectedBaseResumeRowSchema,
  retiredSelectedBaseResumeRowSchema,
])

const applicationPersistenceRowSchema = z
  .object({
    applied_on: applicationAppliedOnSchema.nullable(),
    company: applicationCompanySchema,
    created_at: timestampSchema,
    id: applicationIdSchema,
    job_description: applicationJobDescriptionSchema,
    notes: applicationNotesSchema,
    posting_url: applicationPostingUrlSchema,
    role: applicationRoleSchema,
    selected_base_resume: selectedBaseResumeRowSchema.nullable(),
    selected_base_resume_id: z.uuid().nullable(),
    status: applicationStatusSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((row, context) => {
    if (
      (row.selected_base_resume_id === null) !==
        (row.selected_base_resume === null) ||
      (row.selected_base_resume !== null &&
        row.selected_base_resume.id !== row.selected_base_resume_id)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The selected base resume relationship is inconsistent.',
        path: ['selected_base_resume'],
      })
    }

    if (
      new Date(row.updated_at).getTime() < new Date(row.created_at).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The application update time precedes its creation time.',
        path: ['updated_at'],
      })
    }
  })

const applicationPersistenceRowsSchema = z.array(
  applicationPersistenceRowSchema,
)

type ApplicationPersistenceRow = z.infer<typeof applicationPersistenceRowSchema>

export interface SelectedBaseResumeRecord {
  activeSlot: ActiveBaseResumeSlot | null
  id: string
  originalFilename: string
  retiredAt: string | null
}

export interface ApplicationPersistenceRecord {
  appliedOn: string | null
  company: string
  createdAt: string
  id: string
  jobDescription: string | null
  notes: string | null
  postingUrl: string | null
  role: string
  selectedBaseResume: SelectedBaseResumeRecord | null
  selectedBaseResumeId: string | null
  status: ApplicationStatus
  updatedAt: string
}

export interface CreateApplicationRecord extends CreateApplicationRequest {
  createdAt: string
  status: 'draft'
  updatedAt: string
}

export type UpdateApplicationRecord = UpdateApplicationRequest & {
  updatedAt: string
}

export type ApplicationManagementRepositoryOperation =
  | 'create-application'
  | 'find-application'
  | 'list-applications'
  | 'update-application'

export type ApplicationManagementRepositoryErrorKind =
  'provider-failure' | 'unexpected-result'

export interface ApplicationManagementRepository {
  create(record: CreateApplicationRecord): Promise<ApplicationPersistenceRecord>
  findById(id: string): Promise<ApplicationPersistenceRecord | null>
  list(): Promise<ReadonlyArray<ApplicationPersistenceRecord>>
  update(
    id: string,
    record: UpdateApplicationRecord,
  ): Promise<ApplicationPersistenceRecord | null>
}

export class ApplicationManagementRepositoryError extends Error {
  readonly code = 'application-persistence-unavailable'

  constructor(
    readonly operation: ApplicationManagementRepositoryOperation,
    readonly kind: ApplicationManagementRepositoryErrorKind,
    cause: unknown,
  ) {
    super('Application persistence is temporarily unavailable.', { cause })
    this.name = 'ApplicationManagementRepositoryError'
  }
}

const createRepositoryError = (
  operation: ApplicationManagementRepositoryOperation,
  cause: unknown,
  kind: ApplicationManagementRepositoryErrorKind = 'provider-failure',
): ApplicationManagementRepositoryError =>
  new ApplicationManagementRepositoryError(operation, kind, cause)

const toApplicationPersistenceRecord = (
  row: ApplicationPersistenceRow,
): ApplicationPersistenceRecord => ({
  appliedOn: row.applied_on,
  company: row.company,
  createdAt: row.created_at,
  id: row.id,
  jobDescription: row.job_description,
  notes: row.notes,
  postingUrl: row.posting_url,
  role: row.role,
  selectedBaseResume: row.selected_base_resume
    ? {
        activeSlot: row.selected_base_resume.active_slot,
        id: row.selected_base_resume.id,
        originalFilename: row.selected_base_resume.original_filename,
        retiredAt: row.selected_base_resume.retired_at,
      }
    : null,
  selectedBaseResumeId: row.selected_base_resume_id,
  status: row.status,
  updatedAt: row.updated_at,
})

const parseApplicationPersistenceRecord = (
  data: unknown,
): ApplicationPersistenceRecord =>
  toApplicationPersistenceRecord(applicationPersistenceRowSchema.parse(data))

const parseApplicationPersistenceRecords = (
  data: unknown,
): ReadonlyArray<ApplicationPersistenceRecord> =>
  applicationPersistenceRowsSchema
    .parse(data)
    .map(toApplicationPersistenceRecord)

const toApplicationUpdate = (
  record: UpdateApplicationRecord,
): Database['public']['Tables']['applications']['Update'] => {
  const update: Database['public']['Tables']['applications']['Update'] = {
    updated_at: record.updatedAt,
  }

  if (record.appliedOn !== undefined) {
    update.applied_on = record.appliedOn
  }

  if (record.company !== undefined) {
    update.company = record.company
  }

  if (record.jobDescription !== undefined) {
    update.job_description = record.jobDescription
  }

  if (record.notes !== undefined) {
    update.notes = record.notes
  }

  if (record.postingUrl !== undefined) {
    update.posting_url = record.postingUrl
  }

  if (record.role !== undefined) {
    update.role = record.role
  }

  if (record.selectedBaseResumeId !== undefined) {
    update.selected_base_resume_id = record.selectedBaseResumeId
  }

  if (record.status !== undefined) {
    update.status = record.status
  }

  return update
}

export function createApplicationManagementRepository({
  client,
  userId,
}: ProductDataRepositoryContext): ApplicationManagementRepository {
  return {
    async create(record) {
      try {
        const insert = {
          applied_on: null,
          company: record.company,
          created_at: record.createdAt,
          job_description: record.jobDescription,
          notes: record.notes,
          posting_url: record.postingUrl,
          role: record.role,
          selected_base_resume_id: record.selectedBaseResumeId,
          status: record.status,
          updated_at: record.updatedAt,
          user_id: userId,
        } satisfies Database['public']['Tables']['applications']['Insert']
        const { data, error } = await client
          .from('applications')
          .insert(insert)
          .select(applicationManagementProjection)
          .single()

        if (error) {
          throw error
        }

        try {
          return parseApplicationPersistenceRecord(data)
        } catch (error) {
          throw createRepositoryError(
            'create-application',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof ApplicationManagementRepositoryError) {
          throw error
        }

        throw createRepositoryError('create-application', error)
      }
    },

    async findById(id) {
      try {
        const { data, error } = await client
          .from('applications')
          .select(applicationManagementProjection)
          .eq('user_id', userId)
          .eq('id', id)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parseApplicationPersistenceRecord(data)
        } catch (error) {
          throw createRepositoryError(
            'find-application',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof ApplicationManagementRepositoryError) {
          throw error
        }

        throw createRepositoryError('find-application', error)
      }
    },

    async list() {
      try {
        const { data, error } = await client
          .from('applications')
          .select(applicationManagementProjection)
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })

        if (error) {
          throw error
        }

        try {
          return parseApplicationPersistenceRecords(data)
        } catch (error) {
          throw createRepositoryError(
            'list-applications',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof ApplicationManagementRepositoryError) {
          throw error
        }

        throw createRepositoryError('list-applications', error)
      }
    },

    async update(id, record) {
      try {
        const { data, error } = await client
          .from('applications')
          .update(toApplicationUpdate(record))
          .eq('user_id', userId)
          .eq('id', id)
          .select(applicationManagementProjection)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (data === null) {
          return null
        }

        try {
          return parseApplicationPersistenceRecord(data)
        } catch (error) {
          throw createRepositoryError(
            'update-application',
            error,
            'unexpected-result',
          )
        }
      } catch (error) {
        if (error instanceof ApplicationManagementRepositoryError) {
          throw error
        }

        throw createRepositoryError('update-application', error)
      }
    },
  }
}
