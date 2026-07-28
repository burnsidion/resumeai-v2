export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      applications: {
        Row: {
          applied_on: string | null
          company: string
          created_at: string
          id: string
          job_description: string | null
          notes: string | null
          posting_url: string | null
          role: string
          selected_base_resume_id: string | null
          status: string
          submitted_finalized_resume_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_on?: string | null
          company: string
          created_at?: string
          id?: string
          job_description?: string | null
          notes?: string | null
          posting_url?: string | null
          role: string
          selected_base_resume_id?: string | null
          status?: string
          submitted_finalized_resume_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_on?: string | null
          company?: string
          created_at?: string
          id?: string
          job_description?: string | null
          notes?: string | null
          posting_url?: string | null
          role?: string
          selected_base_resume_id?: string | null
          status?: string
          submitted_finalized_resume_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'applications_selected_base_resume_fkey'
            columns: ['selected_base_resume_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'base_resumes'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'applications_submitted_finalized_resume_fkey'
            columns: ['submitted_finalized_resume_id', 'id', 'user_id']
            isOneToOne: false
            referencedRelation: 'finalized_resumes'
            referencedColumns: ['id', 'application_id', 'user_id']
          },
        ]
      }
      base_resumes: {
        Row: {
          active_slot: number | null
          content_sha256: string
          content_type: string
          created_at: string
          id: string
          original_filename: string
          retired_at: string | null
          size_bytes: number
          storage_object_key: string
          user_id: string
        }
        Insert: {
          active_slot?: number | null
          content_sha256: string
          content_type?: string
          created_at?: string
          id?: string
          original_filename: string
          retired_at?: string | null
          size_bytes: number
          storage_object_key: string
          user_id: string
        }
        Update: {
          active_slot?: number | null
          content_sha256?: string
          content_type?: string
          created_at?: string
          id?: string
          original_filename?: string
          retired_at?: string | null
          size_bytes?: number
          storage_object_key?: string
          user_id?: string
        }
        Relationships: []
      }
      finalized_resumes: {
        Row: {
          application_id: string
          content_sha256: string
          created_at: string
          id: string
          pdf_sha256: string
          pdf_size_bytes: number
          pdf_storage_object_key: string
          renderer_name: string
          renderer_version: string
          source_base_resume_id: string
          source_resume_sha256: string
          source_working_copy_id: string
          source_working_copy_revision: number
          source_working_copy_sha256: string
          structured_content: Json
          user_id: string
        }
        Insert: {
          application_id: string
          content_sha256: string
          created_at?: string
          id?: string
          pdf_sha256: string
          pdf_size_bytes: number
          pdf_storage_object_key: string
          renderer_name: string
          renderer_version: string
          source_base_resume_id: string
          source_resume_sha256: string
          source_working_copy_id: string
          source_working_copy_revision: number
          source_working_copy_sha256: string
          structured_content: Json
          user_id: string
        }
        Update: {
          application_id?: string
          content_sha256?: string
          created_at?: string
          id?: string
          pdf_sha256?: string
          pdf_size_bytes?: number
          pdf_storage_object_key?: string
          renderer_name?: string
          renderer_version?: string
          source_base_resume_id?: string
          source_resume_sha256?: string
          source_working_copy_id?: string
          source_working_copy_revision?: number
          source_working_copy_sha256?: string
          structured_content?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'finalized_resumes_application_fkey'
            columns: ['application_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'finalized_resumes_base_resume_fkey'
            columns: [
              'source_base_resume_id',
              'user_id',
              'source_resume_sha256',
            ]
            isOneToOne: false
            referencedRelation: 'base_resumes'
            referencedColumns: ['id', 'user_id', 'content_sha256']
          },
          {
            foreignKeyName: 'finalized_resumes_working_copy_fkey'
            columns: [
              'source_working_copy_id',
              'application_id',
              'user_id',
              'source_base_resume_id',
              'source_resume_sha256',
            ]
            isOneToOne: false
            referencedRelation: 'working_copies'
            referencedColumns: [
              'id',
              'application_id',
              'user_id',
              'source_base_resume_id',
              'source_resume_sha256',
            ]
          },
        ]
      }
      resume_interpretations: {
        Row: {
          base_resume_id: string
          content_sha256: string
          created_at: string
          id: string
          interpreter_name: string
          interpreter_version: string
          schema_version: number
          source_resume_sha256: string
          structured_content: Json
          user_id: string
        }
        Insert: {
          base_resume_id: string
          content_sha256: string
          created_at?: string
          id?: string
          interpreter_name: string
          interpreter_version: string
          schema_version: number
          source_resume_sha256: string
          structured_content: Json
          user_id: string
        }
        Update: {
          base_resume_id?: string
          content_sha256?: string
          created_at?: string
          id?: string
          interpreter_name?: string
          interpreter_version?: string
          schema_version?: number
          source_resume_sha256?: string
          structured_content?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'resume_interpretations_base_resume_fkey'
            columns: ['base_resume_id', 'user_id', 'source_resume_sha256']
            isOneToOne: false
            referencedRelation: 'base_resumes'
            referencedColumns: ['id', 'user_id', 'content_sha256']
          },
        ]
      }
      working_copies: {
        Row: {
          accepted_at: string | null
          application_id: string
          change_summary: Json
          content_sha256: string
          created_at: string
          id: string
          model_name: string
          prompt_version: string
          provider_name: string
          revision_number: number
          source_base_resume_id: string
          source_interpretation_id: string
          source_interpretation_sha256: string
          source_resume_sha256: string
          state: Database['public']['Enums']['working_copy_state']
          structured_content: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          application_id: string
          change_summary: Json
          content_sha256: string
          created_at?: string
          id?: string
          model_name: string
          prompt_version: string
          provider_name: string
          revision_number?: number
          source_base_resume_id: string
          source_interpretation_id: string
          source_interpretation_sha256: string
          source_resume_sha256: string
          state?: Database['public']['Enums']['working_copy_state']
          structured_content: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          application_id?: string
          change_summary?: Json
          content_sha256?: string
          created_at?: string
          id?: string
          model_name?: string
          prompt_version?: string
          provider_name?: string
          revision_number?: number
          source_base_resume_id?: string
          source_interpretation_id?: string
          source_interpretation_sha256?: string
          source_resume_sha256?: string
          state?: Database['public']['Enums']['working_copy_state']
          structured_content?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'working_copies_application_fkey'
            columns: ['application_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'working_copies_base_resume_fkey'
            columns: [
              'source_base_resume_id',
              'user_id',
              'source_resume_sha256',
            ]
            isOneToOne: false
            referencedRelation: 'base_resumes'
            referencedColumns: ['id', 'user_id', 'content_sha256']
          },
          {
            foreignKeyName: 'working_copies_interpretation_fkey'
            columns: [
              'source_interpretation_id',
              'source_base_resume_id',
              'user_id',
              'source_interpretation_sha256',
            ]
            isOneToOne: false
            referencedRelation: 'resume_interpretations'
            referencedColumns: [
              'id',
              'base_resume_id',
              'user_id',
              'content_sha256',
            ]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      working_copy_state: 'awaiting_review' | 'accepted'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      working_copy_state: ['awaiting_review', 'accepted'],
    },
  },
} as const
