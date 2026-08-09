import type { SupabaseClient } from '@supabase/supabase-js'

import { BASE_RESUME_CONTENT_TYPE } from '../../../shared/base-resumes/constraints'
import type { Database } from './database.generated'

export const BASE_RESUME_BUCKET_NAME = 'base-resumes'

export type BaseResumeStorageOperation =
  | 'check-object-existence'
  | 'remove-untracked-object'
  | 'upload-immutable-object'

export type BaseResumeObjectRemovalResult = 'not-removed' | 'removed'

export interface UploadBaseResumeObjectInput {
  bytes: Uint8Array
  objectKey: string
}

export interface BaseResumeStorage {
  objectExists(objectKey: string): Promise<boolean>
  removeUntrackedObject(
    objectKey: string,
  ): Promise<BaseResumeObjectRemovalResult>
  uploadImmutableObject(input: UploadBaseResumeObjectInput): Promise<void>
}

export class BaseResumeStorageError extends Error {
  readonly code = 'base-resume-storage-unavailable'

  constructor(
    readonly operation: BaseResumeStorageOperation,
    cause: unknown,
  ) {
    super('Base resume storage is temporarily unavailable.', { cause })
    this.name = 'BaseResumeStorageError'
  }
}

const withBaseResumeStorageError = async <T>(
  operation: BaseResumeStorageOperation,
  action: () => Promise<T>,
): Promise<T> => {
  try {
    return await action()
  } catch (error) {
    if (error instanceof BaseResumeStorageError) {
      throw error
    }

    throw new BaseResumeStorageError(operation, error)
  }
}

export function createBaseResumeStorage(
  client: Pick<SupabaseClient<Database>, 'storage'>,
): BaseResumeStorage {
  const bucket = client.storage.from(BASE_RESUME_BUCKET_NAME)

  return {
    objectExists: (objectKey) =>
      withBaseResumeStorageError('check-object-existence', async () => {
        const { data: exists, error } = await bucket.exists(objectKey)

        if (!exists) {
          return false
        }

        if (error) {
          throw error
        }

        return true
      }),

    removeUntrackedObject: (objectKey) =>
      withBaseResumeStorageError('remove-untracked-object', async () => {
        const { data, error } = await bucket.remove([objectKey])

        if (error) {
          throw error
        }

        if (!data || data.length > 1) {
          throw new Error('The Storage cleanup result was inconsistent.')
        }

        return data.length === 1 ? 'removed' : 'not-removed'
      }),

    uploadImmutableObject: ({ bytes, objectKey }) =>
      withBaseResumeStorageError('upload-immutable-object', async () => {
        const { data, error } = await bucket.upload(objectKey, bytes, {
          contentType: BASE_RESUME_CONTENT_TYPE,
          upsert: false,
        })

        if (error) {
          throw error
        }

        if (!data || data.path !== objectKey) {
          throw new Error('The Storage upload result was inconsistent.')
        }
      }),
  }
}
