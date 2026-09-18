import type { SupabaseClient } from '@supabase/supabase-js'

import { BASE_RESUME_BUCKET_NAME } from './base-resume-storage'
import type { Database } from './database.generated'

export interface ResumeInterpretationStorage {
  downloadPrivatePdf(objectKey: string): Promise<Uint8Array>
}

export class ResumeInterpretationStorageError extends Error {
  readonly code = 'resume-interpretation-storage-unavailable'
  readonly operation = 'download-private-base-resume'

  constructor(cause: unknown) {
    super('The selected base resume is temporarily unavailable.', { cause })
    this.name = 'ResumeInterpretationStorageError'
  }
}

export function createResumeInterpretationStorage(
  client: Pick<SupabaseClient<Database>, 'storage'>,
): ResumeInterpretationStorage {
  const bucket = client.storage.from(BASE_RESUME_BUCKET_NAME)

  return {
    async downloadPrivatePdf(objectKey) {
      try {
        const { data, error } = await bucket.download(objectKey)

        if (error) {
          throw error
        }

        if (data === null) {
          throw new Error('The private PDF download result was absent.')
        }

        return new Uint8Array(await data.arrayBuffer())
      } catch (error) {
        if (error instanceof ResumeInterpretationStorageError) {
          throw error
        }

        throw new ResumeInterpretationStorageError(error)
      }
    },
  }
}
