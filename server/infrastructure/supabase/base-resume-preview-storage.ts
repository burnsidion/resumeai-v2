import type { SupabaseClient } from '@supabase/supabase-js'

import { BASE_RESUME_BUCKET_NAME } from './base-resume-storage'
import type { Database } from './database.generated'

export interface BaseResumePreviewStorage {
  createSignedPreviewUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string>
}

export class BaseResumePreviewStorageError extends Error {
  readonly code = 'base-resume-preview-unavailable'
  readonly operation = 'create-signed-preview-url'

  constructor(cause: unknown) {
    super('Base resume preview storage is temporarily unavailable.', { cause })
    this.name = 'BaseResumePreviewStorageError'
  }
}

export function createBaseResumePreviewStorage(
  client: Pick<SupabaseClient<Database>, 'storage'>,
): BaseResumePreviewStorage {
  const bucket = client.storage.from(BASE_RESUME_BUCKET_NAME)

  return {
    async createSignedPreviewUrl(objectKey, expiresInSeconds) {
      try {
        const { data, error } = await bucket.createSignedUrl(
          objectKey,
          expiresInSeconds,
        )

        if (error) {
          throw error
        }

        if (!data?.signedUrl) {
          throw new Error('The signed preview result was incomplete.')
        }

        return data.signedUrl
      } catch (error) {
        if (error instanceof BaseResumePreviewStorageError) {
          throw error
        }

        throw new BaseResumePreviewStorageError(error)
      }
    },
  }
}
