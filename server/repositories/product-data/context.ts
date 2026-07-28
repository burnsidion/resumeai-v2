import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../../infrastructure/supabase/database.generated'

export interface ProductDataRepositoryContext {
  client: SupabaseClient<Database>
  userId: string
}
